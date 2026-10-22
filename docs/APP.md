# App

The app and its API: turret view, pest photos, spray history, alerts with pop-ups, and manual control (hold to spray, stop spray, move, home, pause, settings). It runs on the Raspberry Pi 5.

Not in the app yet: patrol schedule, plot setup, battery level and alerts, abnormal-current and E-stop status, live view (planned), and split response-time logging. The full list is in [DOCUMENTATION.md section 16.5](DOCUMENTATION.md#165-code-vs-the-approved-design).

The app (Next.js) lives at the repo root: `src/`, `scripts/`, `tests/`, `package.json`. Keep it there. Do not add a top-level `app/` folder: Next.js treats a root `app/` as the page router and then ignores `src/app/`, so every page returns 404.
