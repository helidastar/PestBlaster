#!/usr/bin/env bash
# Laptop checks for the turret firmware (needs g++; the contract check also needs curl).
#   bash firmware/turret/test/run.sh                 unit tests + compile check of every firmware file
#   bash firmware/turret/test/run.sh --app URL       also send the firmware's real requests to a running app
#                                                    (e.g. http://localhost:3000 after "npm run dev")
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
fw="$here/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

echo "== pin map"
cmp -s "$fw/pins.h" "$fw/../bringup/pins.h" || { echo "turret/pins.h and bringup/pins.h differ: keep them the same"; exit 1; }
echo "turret/pins.h matches bringup/pins.h"

echo "== unit tests"
g++ -std=c++17 -Wall -Wextra -O1 -o "$out/test_logic" "$here/test_logic.cpp" "$fw/logic.cpp" -lm
"$out/test_logic"

echo "== compile check (laptop stand-ins for the Arduino API; the real build is the Arduino IDE)"
mkdir -p "$out/inc" && cp "$fw/secrets.example.h" "$out/inc/secrets.h"
cp "$fw/turret.ino" "$out/turret_ino.cpp"
for f in "$out/turret_ino.cpp" "$fw/control.cpp" "$fw/hw.cpp" "$fw/net.cpp" "$fw/logic.cpp"; do
  g++ -std=c++17 -Wall -Wextra -Wno-unused-parameter -fsyntax-only -I"$here/stubs" -I"$out/inc" -I"$fw" "$f"
done
echo "all firmware files compile"

if [[ "${1:-}" == "--app" ]]; then
  url="${2:?give the app URL, e.g. http://localhost:3000}"
  key="${DEVICE_API_KEY:-pestblaster-dev}"
  jpeg="$out/frame.jpg"
  # A real 640 x 480 JPEG for the upload (any photo works; the simulated detector does not look at it).
  if [[ -n "${JPEG:-}" ]]; then cp "$JPEG" "$jpeg"; else printf '\xff\xd8\xff\xd9' > "$jpeg"; fi
  "$out/test_logic" emit "$out" "$jpeg"
  hdr=(-H "x-device-key: $key" -H "x-device-id: turret-1")
  echo "== contract check against $url"
  curl -sS -f "${hdr[@]}" -H 'content-type: application/json' --data-binary @"$out/heartbeat.json" \
    "$url/api/device/heartbeat" -o "$out/hb.reply"
  "$out/test_logic" parse "$out/hb.reply" heartbeat
  curl -sS -f "${hdr[@]}" -H 'content-type: multipart/form-data; boundary=----pestblaster-frame-7d3f' \
    --data-binary @"$out/capture.body" "$url/api/device/captures" -o "$out/cap.reply"
  "$out/test_logic" parse "$out/cap.reply" capture
  curl -sS -f "${hdr[@]}" -H 'content-type: application/json' --data-binary @"$out/fire.json" \
    "$url/api/device/fires" -o /dev/null
  echo "spray report accepted"
  echo "contract check passed"
fi
