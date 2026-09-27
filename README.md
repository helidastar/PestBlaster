<div align="center">

# PestBlaster

**Autonomous Rotating Turret for Detection and Organic Deterrence of Leaf-Feeding Pests in Lettuce Crops**

A garden turret that finds diamondback moth larvae, loopers and aphids on lettuce and sprays them with an organic deterrent right away, with no one watching. Growers follow and control it from their phone.

![Status](https://img.shields.io/badge/status-increment%201%20(software)-blue)
![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![ESP32](https://img.shields.io/badge/ESP32--S3-E7352C?logo=espressif&logoColor=white)

**[Read the Full Documentation](https://github.com/helidastar/PestBlaster/blob/feat/increment-1/docs/DOCUMENTATION.md)**

</div>

---

## About

Lettuce in Cebu's school and community gardens is damaged by leaf-feeding pests. Existing smart garden systems only send an alert, and the larvae keep eating until someone arrives.

**PestBlaster** is a turret that rotates 360°, moves up and down a telescoping post, and swings its camera under the leaves. When it sees a pest, it aims and sprays a short burst of organic deterrent (neem oil or garlic–chili mix). Every photo, spray and alert is logged and shown in the grower app.

## Key Features

- **Pest Detection** — photos from the turret camera are checked for three pests
- **Target Tracking** — pan, lift and swivel are aimed at the pest, including leaf undersides
- **Automated Spraying** — timed bursts, with a confidence threshold and a wait between sprays
- **Remote Monitoring** — live turret map, pest photos, spray history
- **Alerts** — pest found, refill the deterrent bottle
- **Manual Override** — spray now, move the turret, pause, or turn auto-spray off
- **Data Logging** — pest trends per day to spot infestation patterns

## Tech Stack

Next.js (App Router) · React · TypeScript · SQLite (built into Node.js 22) · Vitest · ESP32-S3 + OV5640 camera *(hardware, planned)*

Pest detection runs on the server. The ESP32 only moves, takes photos, sprays and reports.

## Project Status

**Increment 1 (software) is built and tested.** The backend, device API, grower app, fire rule, aiming logic and scan path work end to end. A turret simulator stands in for the ESP32, so the whole loop runs without hardware. 32 unit tests pass.

Next: train the pest detection model and bring up the ESP32 firmware (Increment 2), then build the physical turret (Increment 3). See the [increment plan](https://github.com/helidastar/PestBlaster/blob/feat/increment-1/docs/DOCUMENTATION.md#appendix-a--increment-plan).

## Getting Started

Requires **Node.js 22.13+**.

```bash
npm install
npm run dev          # app + API at http://localhost:3000
npm run simulate     # in a second terminal: the pretend turret
```

To open it on a phone, connect the phone to the same Wi-Fi and go to `http://<your-laptop-ip>:3000`.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm run simulate` | Run the turret simulator (`-- --once`, `--step 800`, `--reservoir 30`) |
| `npm run build && npm start` | Faster production run for demos |
| `npm run reset-data` | Clear the database and photos |
| `npm test` | Run the unit tests |

## Branches & Versions

| Branch / tag | What it is |
|--------------|------------|
| `main` | Stable, checked version of the project |
| `development` | Backup of `main` taken right before each increment is merged |
| `feat/<area>` | Work in progress, merged into `main` by pull request |
| `before-increment-N` | Tag: permanent snapshot of `main` before increment N |

Commit messages are one line: `type(area): what changed`, for example `feat(ui): add spray history tab`.

`main` is protected: changes go in only by pull request, need an approving review from a code owner, and must pass the `main guard` check (commit message format and `npm test`). Force-pushes and deleting `main` are blocked.

Before merging an increment into `main`:

```bash
git fetch origin
git push origin origin/main:development                 # update the backup branch
git tag -a before-increment-2 origin/main -m "main before increment 2"
git push origin before-increment-2                      # keep a permanent snapshot
```

## Documentation

> **The complete project documentation is in [docs/DOCUMENTATION.md](https://github.com/helidastar/PestBlaster/blob/feat/increment-1/docs/DOCUMENTATION.md).**
>
> It covers the system flow, architecture, data model, device and app APIs, hardware summary, setup, the increment plan, testing strategies and the pest detection model plan.

## Contributors

| Name | GitHub |
|------|--------|
| Adriyanna G. Diana | — |
| Maria Mhikyla L. Jayno | [@mhiksNmatch](https://github.com/mhiksNmatch) |
| Charity T. Ricabo | [@helidastar](https://github.com/helidastar) |

<div align="center">

**BS Computer Engineering · Cebu Institute of Technology – University** · Adviser: Engr. Nikko D. Alferez

</div>
