# firmware/

Code for the ESP32-S3 CAM (part H9) in the turret head. It moves the turret, takes photos, sprays, and reports to the Pi 5 over Wi-Fi.

| Folder | What it is |
|---|---|
| `bringup/` | Bring-up test. Checks every wire on schematic pages 2-3, one part at a time. Run it first on a new board. |

## Run the bring-up test

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) and the ESP32 boards (Boards Manager: "esp32" by Espressif).
2. Install the library **Adafruit PWM Servo Driver** (Library Manager).
3. Open `bringup/bringup.ino`. Arduino IDE opens `pins.h` as a second tab.
4. Tools: board **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**.
5. Lift the turret off the plants and empty the reservoir, then upload.
6. Open Serial Monitor at **115200**. Expect the I2C scan to find `0x20`, `0x40` and `0x41`.

`pins.h` is the single pin map. Check it against your board's pinout before soldering, and change pins only there.
