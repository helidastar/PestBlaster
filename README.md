<a id="readme-top"></a>

<div align="center">

# PestBlaster

**Autonomous Rotating Turret for Detection and Organic Deterrence of Leaf-Feeding Pests in Lettuce Crops**

Spot the pest. Aim at it. Spray it with an organic deterrent. No one has to be watching.

BS Computer Engineering thesis · Cebu Institute of Technology – University · Adviser: Engr. Nikko D. Alferez

![Status](https://img.shields.io/badge/status-25%25%20build%20(hardware)-blue)
![Controller](https://img.shields.io/badge/controller-ESP32--S3%20CAM-E7352C?logo=espressif&logoColor=white)
![AI computer](https://img.shields.io/badge/AI-Raspberry%20Pi%205%20%2B%20YOLO11n-A22846?logo=raspberrypi&logoColor=white)
![App](https://img.shields.io/badge/app-Next.js%20%2B%20TypeScript-black?logo=next.js&logoColor=white)
![DB](https://img.shields.io/badge/db-SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-TBD-lightgrey)

Sources: the **(for approval)** Main, Hardware & Software Specs and Function/Features List documents · blueprint v15 · Target: small-scale lettuce farm owners

**[For Reviewers](#for-reviewers)** · **[Quickstart](#collaborator-quickstart)** · **[Local Setup](#local-setup)** · **[Docs](#documentation-map)**

[Report Bug](https://github.com/helidastar/PestBlaster/issues/new?labels=bug) · [Request Feature](https://github.com/helidastar/PestBlaster/issues/new?labels=enhancement)

</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#the-problem">The problem</a></li>
    <li><a href="#what-pestblaster-does">What PestBlaster does</a></li>
    <li><a href="#for-reviewers">For reviewers</a></li>
    <li><a href="#tech-stack">Tech stack</a></li>
    <li><a href="#team">Team</a></li>
    <li><a href="#repository-structure">Repository structure</a></li>
    <li><a href="#build-order">Build order</a></li>
    <li><a href="#collaborator-quickstart">Collaborator Quickstart</a></li>
    <li><a href="#local-setup">Local Setup</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#documentation-map">Documentation map</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## The problem

Lettuce is grown on small-scale farms, but it is vulnerable to leaf-feeding pests. Caterpillars such as loopers, armyworms and cutworms eat the leaf tissue, and aphids suck plant sap, discolor and distort the leaves, and transmit viral diseases. Left unchecked, these pests cause holes and skeletonized leaves, stunted growth and yield loss.

Existing smart garden systems only monitor and alert the user; they take no physical action. On farms without constant supervision, pests keep feeding in the time between an alert and someone responding. There is no low-cost, autonomous system that detects these pests on lettuce and immediately responds with a physical deterrent.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## What PestBlaster does

PestBlaster is an autonomous rotating turret that stands on the ground between two raised planter boxes. An ESP32-S3 camera on the turret photographs the lettuce leaves, and an on-board **Raspberry Pi 5** checks each photo with a **YOLO11n** model (after OpenCV image preprocessing), with no laptop or internet needed. The turret rotates a full 360°, moves its arm up and down, aims a hanging swivel nozzle at the pest and sprays a short burst of organic, non-toxic botanical deterrent. A mobile app supports monitoring, alerts and manual override.

```
  patrol starts  (schedule in the app: day every 60 min, dusk every 15 min, night every 30 min; or a button)
        |
        v
  start-up: turntable turns until the home switch meets the home tab  (0° set)
        |
        v
  scan: set stops over the two planter boxes, three heights (top, middle, soil),
        leaf tops and undersides through the hanging swivel mount
        |
        v
  ESP32-S3 CAM ──Wi-Fi (Pi hotspot)──▶ Raspberry Pi 5:  OpenCV preprocessing ──▶ YOLO11n
        |                                 pest type · confidence · box
        v
  Pi decides:  confidence ≥ threshold (60%) · not paused · auto-spray on
               reservoir above 3% · wait since last spray passed (10 s)
        |  no  ──▶ log the hold reason, keep scanning
        |  yes
        v
  Pi turns the box into rotation, height, swivel (±90°) and tilt
        |
        v
  turret aims ──▶ pump + solenoid valve burst (0.4 s) ──▶ resume scanning
        |
        v
  log capture, detection, spray to SQLite  ──▶  app: photos, alerts, history
        |
        v
  last stop done: park and wait for the next patrol  (≈ 1 min per patrol)
  (ESP32 never sprays on its own · no Pi reply in 5 s = no spray, stop and wait · E-stop cuts all motors)
```

| Users can… | How |
|---|---|
| Set when it patrols | Short patrols (≈ 1 min) on a schedule set in the app: day 07:00–16:00 every 60 min, dusk 17:30–19:30 every 15 min, night 19:30–23:30 every 30 min with the IR illuminator; parked in between to save battery; start one any time from the app |
| Let it find and spray pests on its own | Homing, scan, detect, aim and burst (Function list: Homing, Pest Detection, Target Tracking, Automated Deterrent Firing) |
| Watch it | App shows online status and position, pest photos with boxes, pest type logs, spray history, reservoir and battery level |
| Get alerts | Pest detected, reservoir low, battery below a safe voltage |
| Take over | Spray on command, move the turret, return home, pause, disable auto-spray, change threshold, burst length and wait time |
| See trends | Every capture, detection, spray and command is logged; pests per type per day |
| See it live | Live camera view in the app (planned); scanning pauses while it is open |
| Stop it now | Physical emergency stop cuts power to all motors, the actuator and the pump |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## For reviewers

**Start here:**

1. Read [docs/DOCUMENTATION.md](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md) sections 3, 4 and 7: problem, system flow and architecture.
2. Look at [firmware/bringup/](https://github.com/helidastar/PestBlaster/tree/development/firmware/bringup/), the first code that runs on the real turret.
3. Run the app with the turret simulator using the [Collaborator Quickstart](#collaborator-quickstart).

**What we want you to notice:**

- **The turret never decides to spray.** The ESP32-S3 moves and takes photos; only the Raspberry Pi 5 decides. If the Pi does not reply within 5 s, nothing sprays: the turret stops, keeps trying to reconnect, and carries on when the link is back.
- **Works without internet.** Detection, the database and the app all run on the Pi 5. The ESP32 and the phone join the Pi's own `PestBlaster` Wi-Fi hotspot.
- **Every hold has a reason.** When it does not spray, the app says why (not sure enough, paused, auto-spray off, reservoir empty, waiting between sprays).
- **Every number has a formula.** Detection distance, spray timing and battery life are worked out on the blueprint sheets, or marked as an estimate with the test that will measure it.

**Limits, stated plainly (from the (for approval) Main document):**

- The deterrent only repels pests; it does not kill them and is not a substitute for full integrated pest management.
- Accuracy may drop for small green pests such as loopers, when leaves overlap and hide the pest, and in poor light, rain or wind.
- The 0.5 m arm may still sway in wind, which affects fine targeting. The lift has a fixed 30 cm travel and moves slowly.
- The head reaches only about 20 cm past the planter box wall, so the system suits narrow boxes only.
- The swivel turns ±90°; its hose and cable flex with every sweep and need strain relief and cycle testing.
- One camera head. Night photos use the IR illuminator, so night accuracy may be lower than in daylight.
- Not rated for extreme weather. The reservoir needs manual refilling.
- The pest model is **not trained yet**, and the Increment 1 software was written before this design. The gaps are listed in [DOCUMENTATION.md §16](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#16-known-issues-caveats--open-questions).

| Question | Where it's answered |
|---|---|
| How does a pest get sprayed? | [DOCUMENTATION.md §4](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#4-system-flow) |
| What runs where? | [DOCUMENTATION.md §7](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#7-system-architecture) |
| What parts is it built from? | [DOCUMENTATION.md §11](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#11-hardware-summary) · blueprint v15 |
| How will it be tested? | [DOCUMENTATION.md Appendix B](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#appendix-b--testing-strategies) · blueprint sheet 19 |
| How will the model be trained? | [DOCUMENTATION.md Appendix C](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#appendix-c--pest-detection-model-plan) · [model/](https://github.com/helidastar/PestBlaster/tree/development/model/) |
| What is still open? | [DOCUMENTATION.md §16](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md#16-known-issues-caveats--open-questions) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Tech stack

| Area | Technology | Purpose |
|---|---|---|
| Turret controller | ESP32-S3 CAM (ESP32-S3-WROOM-1 N16R8), Arduino | Captures photos; controls the stepper, actuator, servos, pump and valve; runs no AI |
| Camera | OV5640 5 MP (IR-cut removed), 850 nm IR LED ring for night patrols | Photos of lettuce leaves; low-resolution live view on request |
| AI computer | Raspberry Pi 5 (4 GB) inside the weatherproof enclosure on the turntable | OpenCV preprocessing, YOLO11n, aim calculation, spray decision, server, database, app |
| ESP32 ↔ Pi link | Wi-Fi through the Pi's own hotspot (no internet, no router) | Photos up, commands back. The ESP32's USB port is kept for flashing and debugging |
| Pest detection | YOLO11n trained in Google Colab, served by FastAPI + Ultralytics | Pest type, confidence and box in each photo |
| App + API | Next.js (App Router), React, TypeScript | Garden Management Mobile App: a web app you add to the phone's home screen (Android APK planned) |
| Database | SQLite | Every capture, detection, spray, command and alert |
| Motion | NEMA 17 + A4988, GT2 belt, lazy susan; 12 V linear actuator 300 mm + DRV8871; 2 × MG996R via PCA9685 | 360° rotation, lift, swivel and tilt |
| Power | 12 V 7 Ah SLA battery (battery only, no solar), 5 A fuse, E-stop, INA219, LM2596, XL4015, AMS1117 | Power, protection and battery monitoring |
| Tests | Vitest + turret simulator | Software tested before the hardware exists |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Team

| Avatar | Name | Area | Program | GitHub |
|---|---|---|---|---|
| <img src="https://github.com/helidastar.png?size=60" width="40" alt="Charity Ricabo avatar"> | Charity Ricabo | Software: repo, Pi 5, model, app, integration and testing | BSCpE | [@helidastar](https://github.com/helidastar) |
| <img src="https://github.com/adiii568.png?size=60" width="40" alt="Adriyanna Diana avatar"> | Adriyanna Diana | Firmware: ESP32 code, electronics wiring and enclosure | BSCpE | [@adiii568](https://github.com/adiii568) |
| <img src="https://github.com/mhiksNmatch.png?size=60" width="40" alt="Maria Mhikyla Jayno avatar"> | Maria Mhikyla Jayno | Hardware: base, turntable, lift, arm and head; purchasing | BSCpE | [@mhiksNmatch](https://github.com/mhiksNmatch) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Repository structure

```
PestBlaster/
├── README.md            # You are here: overview, reviewer guide, setup.
├── firmware/            # ESP32-S3 CAM code.                                  (Firmware)
│   └── bringup/         # Bring-up test: checks every wire, one part at a time.
│       ├── bringup.ino
│       └── pins.h       # The one pin map: GPIOs, I2C addresses, PCF8574 bits, safety numbers.
├── pi/                  # Raspberry Pi 5 set-up and the detection server.     (Software)
├── model/               # Pest dataset notes, training scripts, training log. (Software)
├── app/                 # Where the app will move (see app/README.md).        (Software)
├── src/                 # Increment 1 app + API (Next.js), for now at the repo root.
│   ├── app/             # Pages: Turret, Pests, Control, History; api/ route handlers.
│   ├── components/      # Radar, Reservoir, Snapshot, TrendChart, Nav.
│   └── lib/             # Fire rule, aiming, scan path, detector, SQLite store.
├── scripts/             # Turret simulator, reset-data.
├── tests/               # Vitest unit tests.
├── data/                # SQLite database and photos (git-ignored).
└── docs/                # DOCUMENTATION.md and other project docs.               (All)
```

The ESP32 and the Pi are separate programs that talk over the Pi's Wi-Fi hotspot, so each has its own folder. The app and its API are one Next.js program that runs on the Pi.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Build order

The order follows blueprint v15 and the Thesis 1 schedule. Each step needs the one before it.

**25% check, Oct 30: base turning and lift moving**

1. Buy the hardware (rebar, glue, screws, PVC pipes, tee nuts) and check out the splash skirt order. (Hardware)
2. Build the base board and the 4 ground stakes. Cut the turntable disc and spacer ring. Varnish 2 coats. (Hardware)
3. 3D-print the top guide cap L4. Build the lift post. (Hardware)
4. Fit the turntable on the base, then the rotation drive: stepper, 16T and 80T pulleys, belt, home switch, splash skirt. (Hardware)
5. Mount the actuator and join it to the lift. (Hardware)
6. Run `firmware/bringup` to check every wire. (Firmware)
7. First firmware: stepper turns 360° both ways, home switch sets 0° at start-up, actuator up and down within its limits. (Firmware)
8. Full test of rotation and lift together. Record video and photos for the check. (All)

**50% build, Nov 3-13**

9. Spray line (pump, valve, hoses), arm and head. (Hardware, Firmware)
10. Trained pest model in `model/`. (Software)
11. Raspberry Pi 5 set up in `pi/`: detection server, ESP32 talking to it over the Pi's Wi-Fi hotspot. (Software, Firmware)
12. Prototype app. (Software)

**After the 50% build:** kickstarter video (Nov 16-20), panel defense (Nov 23-27).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Collaborator Quickstart

1. Ask Charity ([@helidastar](https://github.com/helidastar)) to add you as a collaborator on this repo.
2. Clone and switch to `development`:

   ```bash
   git clone https://github.com/helidastar/PestBlaster.git
   cd PestBlaster
   git checkout development
   npm install
   ```

3. Run the app with the pretend turret:

   ```bash
   npm run dev          # http://localhost:3000
   npm run simulate     # in a second terminal
   ```

4. Firmware: open `firmware/bringup/bringup.ino` in the Arduino IDE (steps in [firmware/README.md](https://github.com/helidastar/PestBlaster/blob/development/firmware/README.md)).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Local Setup

### Prerequisites

- Git
- Node.js 22.13+ (SQLite is built in; check with `node -v`)
- Arduino IDE 2 with the **esp32** boards (Espressif) and the **Adafruit PWM Servo Driver** library, for the firmware
- *(later)* Python 3 with Ultralytics, for training the model on a laptop

### Environment variables

Optional. Copy `.env.example` to `.env.local`. Never commit `.env.local`.

| Variable | Default | Used for |
|---|---|---|
| `DEVICE_API_KEY` | `pestblaster-dev` | Shared secret the turret sends. Change it before the turret goes on a real network. |
| `PESTBLASTER_DATA_DIR` | `./data` | Where the database and photos go |
| `DETECTOR` | `simulated` | `simulated` or `http` (the real model server) |
| `DETECTOR_URL` | none | Model server URL when `DETECTOR=http` |

### App and simulator

```bash
npm run dev                  # app + API at http://localhost:3000
npm run simulate             # turret simulator (-- --once, --step 800, --reservoir 30)
npm run build && npm start   # faster run for demos
npm run reset-data           # clear the database and photos
```

To open it on a phone, connect the phone to the same Wi-Fi and go to `http://<your-laptop-ip>:3000`. On the finished turret the app runs on the Raspberry Pi 5.

| Page | URL |
|---|---|
| Turret (home) | `/` |
| Pests seen | `/pests` |
| Control and settings | `/control` |
| Trends, sprays, alerts | `/history` |

### Firmware

1. Arduino IDE: Tools > Board **ESP32S3 Dev Module**, PSRAM **OPI PSRAM**.
2. Open `firmware/bringup/bringup.ino`, upload, open Serial Monitor at 115200.
3. Run it with the turret lifted off the plants and the reservoir empty.

### Tests

```bash
npm test             # unit tests (Vitest)
npm run typecheck    # TypeScript check
```

Hardware tests (detection distance, aim, spray, battery, weather) follow the test sheet, blueprint sheet 19.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

- [x] Increment 1 software: backend, device API, app, fire rule, aiming, scan path, simulator, unit tests
- [x] Blueprint v15 (52 sheets) and electronics schematic v15
- [x] Firmware bring-up test and pin map
- [ ] Base, turntable and rotation drive built (25% check, Oct 30)
- [ ] Lift post and actuator working (25% check, Oct 30)
- [ ] First firmware: 360° turns, homing, lift up and down (25% check, Oct 30)
- [ ] Spray line, arm and head (50% build, Nov 3-13)
- [ ] Pest dataset collected and YOLO11n trained (50% build)
- [ ] Raspberry Pi 5 set up: hotspot, detection server and Wi-Fi link to the ESP32 (50% build)
- [ ] App updated to the approved design: new pest list, swivel ±90° and tilt, battery level and alert, live view (50% build)
- [ ] Every line of the test sheet (sheet 19) filled in with measured values and % error
- [ ] Field test next to an unprotected control bed

See the [open issues](https://github.com/helidastar/PestBlaster/issues) for more.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

Work goes from a feature branch into `development` through a pull request. `main` only gets `development` when the project is finished.

1. Branch from `development` (`git checkout -b feat/<area>`, for example `feat/firmware`, `feat/model`)
2. Commit with a one-line message in the form `type(area): what changed` (e.g. `feat(firmware): turn the stepper 360 degrees both ways`). Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
3. Check your work (`npm test` and `npm run typecheck` for the app; compile in the Arduino IDE for firmware)
4. Push the branch (`git push -u origin feat/<area>`)
5. Open a pull request into `development`. One other team member reviews it before it is merged.

| Branch / tag | What it is |
|---|---|
| `development` | Working branch. Every feature is merged here. **Start here.** |
| `feat/<area>` | One feature in progress |
| `main` | Finished, stable version. Protected: pull request, code owner review and the `main guard` check |
| `increment-N` | Tag: snapshot of `development` at increment N's checking |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Documentation map

| Doc | What's inside |
|---|---|
| [docs/DOCUMENTATION.md](https://github.com/helidastar/PestBlaster/blob/development/docs/DOCUMENTATION.md) | Full project documentation: scope, system flow, architecture, data model, API, hardware, setup, risks, increments, tests, model plan. |
| [firmware/README.md](https://github.com/helidastar/PestBlaster/blob/development/firmware/README.md) | How to run the bring-up test. |
| [pi/README.md](https://github.com/helidastar/PestBlaster/blob/development/pi/README.md) | Raspberry Pi 5 set-up and detection server. |
| [model/README.md](https://github.com/helidastar/PestBlaster/blob/development/model/README.md) | Dataset and training. |
| [app/README.md](https://github.com/helidastar/PestBlaster/blob/development/app/README.md) | Where the app lives and where it is going. |
| Blueprint v15 and schematic v15 | Every part, dimension, step and formula. Kept in the team Drive (too large for git). |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

* Engr. Nikko D. Alferez, our adviser
* [Ultralytics YOLO11](https://docs.ultralytics.com) and [NCNN](https://github.com/Tencent/ncnn)
* [Raspberry Pi](https://www.raspberrypi.com) and [Espressif Arduino core for ESP32](https://github.com/espressif/arduino-esp32)
* [Adafruit PWM Servo Driver library](https://github.com/adafruit/Adafruit-PWM-Servo-Driver-Library)
* [Next.js](https://nextjs.org) and [Vitest](https://vitest.dev)
* [Img Shields](https://shields.io)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<div align="center">

**PestBlaster** · the Pi decides, the turret obeys, and every hold has a reason.

BS Computer Engineering · Cebu Institute of Technology – University · License: TODO (no LICENSE file in the repo yet)

</div>
