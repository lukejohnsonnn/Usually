# Deploying Honeydle on Render (free)

`render.yaml` is a Render Blueprint. It defines:

- **usually**: a free Node web service that runs `npm start`, health-checks
  `/health` and auto-deploys from `main`
- **usually-db**: a free Postgres database, wired in through `DATABASE_URL`

The names match the v1 Blueprint, so merging to `main` updates the existing
service instead of creating a new one.

## First-time or fresh setup

1. Render dashboard → **New +** → **Blueprint** → pick this repo → **Apply**.
2. Wait for the first deploy, then open `https://<service>.onrender.com/health`.
   It should return
   `{"ok":true,"db":"postgres","bankQuestions":152,"date":"…"}`.

The server creates its tables on boot. There is nothing to seed, because the
question bank ships in `data/bank.json`.

## Resuming the suspended v1 service

1. Merge this branch into `main`.
2. Render dashboard → the **usually** service → **Resume service**.
3. If it doesn't deploy on its own: **Manual Deploy → Deploy latest commit**.
4. Check `/health` as above.

If the old database still exists, its v1 tables are left alone. v2 uses its
own `hd_daily_sets` and `hd_plays` tables, so the two never collide.

## Free-tier notes

- **Sleep.** Free web services sleep after about 15 minutes idle, and the first
  visitor waits while it wakes. To keep it awake, point a free uptime monitor
  (UptimeRobot, cron-job.org, etc.) at `/health` every 10 minutes.
- **Free Postgres expires.** Render's free databases are time-limited (30 days
  at the time of writing), and only one free database is allowed per
  workspace. When it expires, create a new free database, set the service's
  `DATABASE_URL` to its connection string, and redeploy. Plays and streaks
  live in the database, so they reset with it. The game itself is unaffected.
- **No cron.** The Daily freezes on the first request of each Eastern day, so
  no scheduler is needed.

## Custom domain

Optional. playhoneydle.com was checked and was free but has **not** been
bought. Add one later under the service's **Settings → Custom Domains**.
