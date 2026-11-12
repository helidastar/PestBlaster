# firmware/

Code for the ESP32-S3 CAM (part H9) in the turret head. It moves the turret, takes photos, sprays, and reports to the Pi 5 over Wi-Fi.

| Folder | What it is |
|---|---|
| `bringup/` | Bring-up test. Checks every wire on schematic pages 2-3, one part at a time. Run it first on a new board. |
| `turret/` | The turret firmware. Patrols, sends every photo to the app, aims and sprays when the app says so, obeys the app's manual commands, and stops on the E-stop, a lost link, a low battery or a jam. |

## Run the bring-up test

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) and the ESP32 boards (Boards Manager: "esp32" by Espressif).
2. Install the library **Adafruit PWM Servo Driver** (Library Manager).
3. Open `bringup/bringup.ino`. Arduino IDE opens `pins.h` as a second tab.
4. Tools: board **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**.
5. Lift the turret off the plants and empty the reservoir, then upload.
6. Open Serial Monitor at **115200**. Expect the I2C scan to find `0x20`, `0x40` and `0x41`.

`pins.h` is the single pin map. Check it against your board's pinout before soldering, and change pins only there. `turret/pins.h` is a copy (Arduino cannot include a file from another sketch folder): change both, and `turret/test/run.sh` fails if they differ.

## Run the turret firmware

Do the bring-up test first, and write what it showed into `turret/config.h` (every line marked **MEASURE**): which actuator wire lifts, which stepper direction turns the disc to bigger angles, and the servo pulse for swivel 0 and tilt 0 / 90.

1. Set up the Pi first (`pi/README.md`). `pi/setup.sh` prints the hotspot password and the `DEVICE_API_KEY`.
2. Copy `turret/secrets.example.h` to `turret/secrets.h` and put those two values in it. Git ignores `secrets.h`.
3. Open `turret/turret.ino`. Same board settings as the bring-up test, plus Partition Scheme **16M Flash (3MB APP)** or **Huge APP**. Library: Adafruit PWM Servo Driver (nothing else to install).
4. Lift the turret off the plants for the first run, then upload and open Serial Monitor at 115200.
5. Expect `[boot] PCF8574 0x20 ok, PCA9685 0x40 ok, INA219 0x41 ok`, `camera ok`, then `[home] done`. The app's home screen shows the turret online with firmware `turret-0.1`.

If a chip or the camera is missing, the turret does not move at all and says which part failed.

### What it does

| Step | What happens | Source |
|---|---|---|
| Boot | Stepper off and IR off first, then I2C check of 0x20 / 0x40 / 0x41 and the camera. Join hotspot `PestBlaster`. | sheet 36, schematic O6 |
| Home | Head to swivel 0, tilt 35; lift down to its bottom stop (full stroke, timed); turntable turns until R7 clicks = 0°. | sheet 36, schematic O8 |
| Check in | `POST /api/device/heartbeat` every 2 s (every 0.25 s during a manual spray). Gets the mode, the settings and the manual commands. | sheet 34, docs 10.1 |
| Patrol | When the app is in **Auto**: find R7, then 12 stops 30° apart, 4 photos per stop: (swivel, tilt) = (−30°, 35°) → (−30°, 75°) → (+30°, 75°) → (+30°, 35°). One servo moves per photo; 1 stale frame is thrown away before each photo. Lift stays down. Then it rests for `PATROL_GAP_S` (60 s) and starts again. | sheet 20 |
| Photo | `POST /api/device/captures`: the 640 × 480 JPEG and the pose. The app runs YOLO and the spray rule and answers `fire` or `hold`. | docs 10.1 |
| Aim | On `fire`: if the target is more than 80° off the arm, turn the turntable first so it is 30° off the arm. Then pump on, swivel and tilt to the target, and send a **confirm photo**. | sheet 36 |
| Spray | Only if the confirm photo also says `fire` and the target is within 3° of the centre: valve open for `burstMs` (pump ran ≥ 0.3 s first), valve shut, pump off, `POST /api/device/fires`. Otherwise no spray. Up to 2 confirm photos. | sheets 34, 36 |
| Manual | From the app's Control page: **Spray** (hold to spray; ends on release), **Move**, **Home**. Each command is reported done or failed. | docs 10.2 |

### Safety rules (checked every 20 ms by their own task)

| Event | What the firmware does | Source |
|---|---|---|
| E-stop pressed (P3 low) | Stepper off, actuator coast, valve shut, pump off; reports `estop`. After release, press **Home** in the app (or switch Paused → Auto) to start again. | sheet 36 |
| No reply from the app for 5 s | No spray (valve shut, pump off), stop moving, retry every 5 s. After 1 min it parks (lift down, home). When the link is back it carries on from the stop it was on. | sheet 34, docs 6.9 |
| Pump on for 3 s without a spray | Pump off. The main loop also never opens the valve past 3 s from pump on. | sheet 36 |
| Battery below 11.8 V for 5 s | Finishes the burst, lift down, parks at home, no patrol until the battery is above 12.4 V. | sheet 36 |
| Current above 4.5 A for 0.5 s | Jam: everything stops until **Home** is pressed in the app. | sheet 36 |
| App set to **Paused** | Stops after the current photo or spray and stays where it is; never moves by itself while paused (manual commands still work). | app Control page |

The turret never sprays without a `fire` reply from the app or a manual Spray command (approved spec).

### How the pose is sent to the app

The app works with three numbers (`pan`, `lift`, `swivel`). The firmware sends:

- `pan` = turntable angle + head swivel = the compass bearing the camera points at,
- `lift` = mm of lift (0 = down),
- `swivel` = head tilt below level (0 = level, 90 = straight down).

With that, the app's aim maths (`src/lib/targeting.ts`) gives a bearing and a tilt, and the firmware turns them back into turntable, swivel and tilt. The real joint angles are also sent as `joints: {t1, psi, phi, lift}`, and battery, E-stop and fault as `status`, for a later app update; the app ignores those extra fields for now.

### Reservoir level

There is no level sensor, so the firmware estimates it: 1.3 % per second of valve-open time (2.5 L bottle, pump ≈ 2 L/min, the same estimate as the simulator). The value is kept through a reset. **After a refill, hold the board's BOOT button for 3 s** to set it back to 100 %.

## Test on a laptop

```bash
bash firmware/turret/test/run.sh                         # unit tests + compile check of every file
npm run dev                                              # in another terminal
bash firmware/turret/test/run.sh --app http://localhost:3000   # send the firmware's real requests to the app
```

The unit tests check the maths and messages (angles, aim, patrol order, the 1.57 s turn time from sheet 17, pump cap, the JSON the app sends back). The compile check uses laptop stand-ins for the Arduino functions, so it catches typing mistakes but not ESP32 problems: the real check is building in the Arduino IDE. The `--app` check posts the exact heartbeat, photo upload and spray report bytes the firmware builds and reads the app's replies the way the firmware does.

## Open items (check on the build)

| # | Item | What to do |
|---|---|---|
| F1 | The firmware has not run on the ESP32 yet. Only the laptop checks above have run. | Build in the Arduino IDE, then run it with the turret lifted off the plants. |
| F2 | Every **MEASURE** line in `config.h`: actuator direction, stepper direction, servo centre and tilt pulses, lift speed, turn acceleration. | Measure in the bring-up test and on test sheet 19. |
| F3 | The app's camera angles now match the blueprint estimate (60.3° × 47.1°, sheet 18) but are not measured. | Measure the lens (test sheet 19) and change `CAMERA` in `src/lib/targeting.ts`. |
| F4 | The coarse turn happens **before** the pump starts, not after the "aim" reply as sheet 36 draws it, so that a 2.2 s turn does not use up the 3 s pump cap. Detect → spray time is the same. | Team to confirm. |
| F5 | The app has no patrol schedule, plot setup, night mode or damage spray yet (sheets 43-45). The firmware patrols all 12 stops in Auto mode with a 60 s rest, day mode only. | Add to the app first; then the firmware reads them. |
| F6 | The app does not show battery, E-stop or faults yet; the firmware already sends them in `status`. | App change. |
| F7 | Battery park waits 5 s below 11.8 V and comes back above 12.4 V. Both are assumptions so a motor start does not trip it. | Check on the battery test (sheet 19). |
