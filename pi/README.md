# pi/

Set-up and code for the Raspberry Pi 5 (part E18) in the enclosure on the turntable (the (for approval) Hardware & Software Specs; blueprint v15 sheets 33-34).

What runs on the Pi:
- **Detection server:** FastAPI + YOLO11n exported to NCNN, on `127.0.0.1:8000`. The app's API sends it each photo (after OpenCV preprocessing) and gets back the pest type, confidence and box.
- **The app and its API** (Next.js, the code in `src/` for now) and the SQLite database.
- **The link to the ESP32-S3:** a USB cable along the post and arm (the (for approval) specs). Blueprint v15 draws this link as Wi-Fi through a Pi hotspot instead; see the open items in `docs/DOCUMENTATION.md` section 16.

Raspberry Pi OS Lite 64-bit, Node.js 22.13+ (the app uses the SQLite built into Node; blueprint sheet 34 says Node 20, which is too old for it), Python venv with fastapi, uvicorn, ultralytics, ncnn. systemd starts everything at boot.

Empty for now. Due at the 50% build (Nov 3-13).
