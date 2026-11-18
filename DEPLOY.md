# Honeydle — deploy guide (free, $0, no accounts for players)

What this repo is: a standalone rebuild of the Honeydle daily game
(guess the %, name the #1, split the 100), ready for Render's
free tier. No cron job — daily sets freeze lazily on first load each
Eastern day, which is the $0 path (Render cron is not free).

## What you need first (Luke's steps)

1. **A GitHub account** — created 2026-11-16, not yet connected to Render.
2. **A Render account** — created 2026-11-16 via Google signup.

## Steps

### 1. Put this repo on GitHub
```bash
cd usually-deploy/repo
git init
git add .
git commit -m "Usually v1 — standalone Render deploy"
git branch -M main
git remote add origin https://github.com/<your-username>/usually.git
git push -u origin main
```
(If GitHub asks for credentials, use a personal access token, not a password.)

### 2. Connect GitHub to Render
Render dashboard → **Account Settings** → **GitHub** → **Connect**.
Authorize the `usually` repo.

### 3. Deploy from the Blueprint
Render dashboard → **New +** → **Blueprint** → pick the `usually` repo.
Render reads `render.yaml` and creates:
- **usually** — free web service (Node, `npm install` → `npm start`)
- **usually-db** — free Postgres

Click **Apply**. First deploy takes a few minutes.

### 4. Set the public URL
After the first deploy, Render gives the service a URL like
`https://usually.onrender.com`. In the service's **Environment** tab, set:
- `APP_URL` = that URL

Then **Manual Deploy → Deploy latest commit** (or wait for auto-deploy).

### 5. Verify
- `https://usually.onrender.com/health` → `{"ok":true,"db":"postgres","bankQuestions":119,...}`
- Open the URL in a browser, play a full Daily, check Contribute unlocks after it.

The question bank seeds itself on first boot (`server.js` calls
`seedBank` at startup). Re-seeding never wipes plays or votes.

## Notes on the free tier

- **Sleep:** the free web service sleeps after ~15 min idle. The first
  player of the day waits ~1 min while it wakes. Daily sets freeze on
  first load, so the wake-up still serves the right day.
- **Free Postgres lifetime:** Render's free Postgres is time-limited —
  check the current terms on Render's pricing page at signup. If the
  database expires, create a fresh free database, point `DATABASE_URL`
  at it, and re-seed with `npm run seed`. Plays and votes live in that
  database, so if they matter, export them before it expires.
- **No cron:** there is deliberately no cron job in `render.yaml`.
  Do not add one — it is not free. The lazy freeze covers the daily
  rotation, and Contribute's 7-day embargo generates future daily sets
  on demand the same way.
- **Costs:** $0. The only future costs are a custom domain (optional,
  e.g. playhoneydle.com ~$12/yr — not bought yet) and moving off the
  free tier if traffic outgrows it.

## Local development
```bash
npm install
npm start            # http://localhost:3000 (JSON file store, data/local.json)
npm run verify       # 54 automated checks (unit + live server)
npm run seed         # seed the bank (safe to re-run)
```
With `DATABASE_URL` set, the server uses Postgres instead of the file store.
