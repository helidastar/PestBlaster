# pi/

Set-up and code for the Raspberry Pi 5 (part E18) in the enclosure on the turntable (the (for approval) Hardware & Software Specs; blueprint v15 sheets 33-34).

What runs on the Pi:
- **Detection server:** FastAPI + YOLO11n exported to NCNN, on `127.0.0.1:8000`. The app's API sends it each photo (after OpenCV preprocessing) and gets back the pest type, confidence and box.
- **The app and its API** (Next.js, the code in `src/` for now) and the SQLite database.
- **Wi-Fi hotspot** `PestBlaster` (WPA2, 2.4 GHz): the ESP32-S3 sends its photos here, and the phone joins it to open the app at `pestblaster.local`. No internet or router needed (blueprint v15, sheet 34).

The ESP32's USB port is not used by the turret at run time; it is kept for flashing and the Serial Monitor.

Raspberry Pi OS Lite 64-bit, Node.js 22.13+ (the app uses the SQLite built into Node; blueprint sheet 34 says Node 20, which is too old for it), Python venv with fastapi, uvicorn, ultralytics, ncnn. systemd starts everything at boot.

Empty for now. Due at the 50% build (Nov 3-13).
