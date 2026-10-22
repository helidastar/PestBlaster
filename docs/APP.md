# App

The app and its API: turret view, pest photos, spray history, alerts, manual control, battery level and alerts, and a live view (planned). It runs on the Raspberry Pi 5.

The app (Next.js) lives at the repo root: `src/`, `scripts/`, `tests/`, `package.json`. Keep it there. Do not add a top-level `app/` folder: Next.js treats a root `app/` as the page router and then ignores `src/app/`, so every page returns 404.
