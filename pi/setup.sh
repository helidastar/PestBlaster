#!/usr/bin/env bash
# Sets up a Raspberry Pi 5 (Raspberry Pi OS Lite 64-bit, Bookworm) to run PestBlaster:
# the app and its API, the model server, and the PestBlaster Wi-Fi hotspot.
#
#   cd ~/PestBlaster && HOTSPOT_PASS='at-least-8-chars' bash pi/setup.sh
#
# Safe to run again after a git pull: it rebuilds the app and restarts the services.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
HOTSPOT_SSID="${HOTSPOT_SSID:-PestBlaster}"
HOTSPOT_PASS="${HOTSPOT_PASS:-}"

step() { printf '\n==> %s\n' "$*"; }

step "System packages"
sudo apt-get update
sudo apt-get install -y git curl python3-venv python3-pip avahi-daemon

step "Node.js 22 (the app needs 22.13+ for its built-in SQLite)"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

step "Hostname pestblaster (phone opens http://pestblaster.local:3000)"
sudo hostnamectl set-hostname pestblaster

step "Wi-Fi hotspot $HOTSPOT_SSID"
if nmcli -t -f NAME con show | grep -qx "$HOTSPOT_SSID"; then
  echo "Hotspot already set up."
elif [ ${#HOTSPOT_PASS} -lt 8 ]; then
  echo "Skipped: set HOTSPOT_PASS (8+ characters) and run again to create the hotspot."
else
  sudo nmcli con add type wifi ifname wlan0 con-name "$HOTSPOT_SSID" autoconnect yes ssid "$HOTSPOT_SSID" \
    802-11-wireless.mode ap 802-11-wireless.band bg ipv4.method shared \
    wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$HOTSPOT_PASS"
  echo "Hotspot created. It starts at boot; the Pi is 10.42.0.1 on it."
fi

step "App settings (.env.local)"
cd "$REPO"
if [ ! -f .env.local ]; then
  key="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed "s/^DEVICE_API_KEY=.*/DEVICE_API_KEY=$key/" .env.example > .env.local
  echo "Created .env.local. Put this DEVICE_API_KEY in the ESP32 firmware: $key"
fi
mkdir -p data

step "App build"
npm ci
npm run build

step "Model server (Python venv in training/.venv)"
python3 -m venv training/.venv
training/.venv/bin/pip install --upgrade pip
training/.venv/bin/pip install -r training/requirements.txt ncnn

step "Services (start at boot)"
for unit in pestblaster-app pestblaster-detector; do
  sed -e "s|@USER@|$USER_NAME|g" -e "s|@REPO@|$REPO|g" "pi/systemd/$unit.service" \
    | sudo tee "/etc/systemd/system/$unit.service" > /dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable pestblaster-app pestblaster-detector
sudo systemctl restart pestblaster-app
sudo systemctl restart pestblaster-detector || true

step "Done"
echo "App:      http://pestblaster.local:3000  (or http://10.42.0.1:3000 on the hotspot)"
echo "Model:    put the trained model in training/models/ (see pi/README.md), then"
echo "          set DETECTOR=http in .env.local and run: sudo systemctl restart pestblaster-app pestblaster-detector"
echo "Logs:     journalctl -u pestblaster-app -f   /   journalctl -u pestblaster-detector -f"
