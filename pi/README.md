# pi/

Set-up for the Raspberry Pi 5 (part E18) in the enclosure on the turntable (Hardware & Software Specs; blueprint v15 sheets 33-34).

What runs on the Pi:
- **The app and its API** (Next.js, the code in `src/`) and the SQLite database in `data/`. Service `pestblaster-app`, port 3000.
- **Model server:** `training/serve.py` (FastAPI + YOLO11n exported to NCNN) on `127.0.0.1:8000`. The app sends it each photo and gets back the pest type, confidence and box. Service `pestblaster-detector`.
- **Wi-Fi hotspot** `PestBlaster` (WPA2, 2.4 GHz): the ESP32-S3 sends its photos here, and the phone joins it to open the app. No internet or router needed (blueprint v15, sheet 34).

The ESP32's USB port is not used by the turret at run time; it is kept for flashing and the Serial Monitor.

| File | What it does |
|------|--------------|
| `setup.sh` | Installs Node.js 22, Python venv and packages, sets the hostname, creates the hotspot, builds the app and installs the services |
| `systemd/pestblaster-app.service` | Starts the app at boot, restarts it if it stops |
| `systemd/pestblaster-detector.service` | Starts the model server at boot, once a model is in `training/models/best_ncnn_model` |

## 1. Prepare the SD card
1. On the laptop, open **Raspberry Pi Imager** → Raspberry Pi 5 → **Raspberry Pi OS Lite (64-bit)**.
2. Edit settings: hostname `pestblaster`, a username and password, your home Wi-Fi (for the first set-up only, to download packages), and **enable SSH**.
3. Write the card, put it in the Pi, power it with the official 5 V 5 A supply and wait about 2 minutes.

## 2. Install PestBlaster
From the laptop on the same Wi-Fi:

```bash
ssh <user>@pestblaster.local
git clone -b dev https://github.com/helidastar/PestBlaster.git
cd PestBlaster
HOTSPOT_PASS='choose-8-or-more-chars' bash pi/setup.sh
```

It takes about 15-25 minutes (the app build and the Python packages are the slow parts). At the end it prints the `DEVICE_API_KEY` that the ESP32 firmware must send. It is also in `.env.local`.

Check it: open `http://pestblaster.local:3000` on the laptop. To see the pretend turret in the app, run the simulator with the key from `.env.local`: `DEVICE_API_KEY=<key> npm run simulate` on the Pi, or add `-- --url http://pestblaster.local:3000` to run it from the laptop.

## 3. Switch to the hotspot
The hotspot needs `wlan0`, so the Pi leaves the home Wi-Fi when it starts the hotspot:

```bash
sudo nmcli con up PestBlaster
```

From now on, join the `PestBlaster` Wi-Fi on the phone or laptop and open `http://10.42.0.1:3000` (or `http://pestblaster.local:3000`, which works on most laptops and iPhones but not on every Android phone). SSH is `ssh <user>@10.42.0.1`.

To download updates, connect a LAN cable (or switch back with `sudo nmcli con up <home-wifi-name>`), then `git pull && bash pi/setup.sh`.

## 4. Add the trained model
1. From the Colab run, download `export/best.pt` into `training/models/` on the Pi (for example `scp best.pt <user>@10.42.0.1:PestBlaster/training/models/`).
2. Export it to NCNN on the Pi (faster than `.pt` on the Pi's CPU):
   ```bash
   cd ~/PestBlaster
   training/.venv/bin/yolo export model=training/models/best.pt format=ncnn imgsz=640
   ```
   This makes `training/models/best_ncnn_model/`.
3. In `.env.local`, set `DETECTOR=http` (keep `DETECTOR_URL=http://localhost:8000/detect`).
4. `sudo systemctl restart pestblaster-detector pestblaster-app`
5. Check: `curl http://127.0.0.1:8000/health` lists the three classes.

## 5. Point the ESP32 at the Pi
In the firmware: Wi-Fi `PestBlaster` with the hotspot password, server `http://10.42.0.1:3000`, header `x-device-key: <DEVICE_API_KEY>`. The endpoints are in [DOCUMENTATION.md section 10.1](../docs/DOCUMENTATION.md#101-device-api-used-by-the-esp32-firmware-and-the-simulator).

## Useful commands
| Need to… | Command |
|----------|---------|
| See the app log | `journalctl -u pestblaster-app -f` |
| See the model server log | `journalctl -u pestblaster-detector -f` |
| Restart after a change | `sudo systemctl restart pestblaster-app` |
| Clear test data | `sudo systemctl stop pestblaster-app && npm run reset-data && sudo systemctl start pestblaster-app` |
| Check the Pi's temperature | `vcgencmd measure_temp` (the enclosure test in direct sun) |
