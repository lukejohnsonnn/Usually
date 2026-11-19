# Deploying Honeydle on Cloudflare (free)

Honeydle runs as a **Cloudflare Worker**:

- **The Worker** (`src/worker.js`) serves the API and the Daily logic.
- **D1** is the database (Cloudflare's SQLite), bound as `DB`.
- **Static assets**: `public/` (the client, fonts, bee art) is served by
  Cloudflare's edge.

All of it is in `wrangler.jsonc`. There's nothing to seed: the question bank is
bundled into the Worker, and the database tables are created on first use.

## First deploy: connect the GitHub repo (no command line)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a
   repository** → connect GitHub if asked → pick **lukejohnsonnn/Usually**.
2. Settings on the build screen:
   - **Project name:** `honeydle` (must match `name` in `wrangler.jsonc`)
   - **Production branch:** `main`
   - **Build command:** leave empty
   - **Deploy command:** `npx wrangler deploy` (the default)
3. **Deploy.** On the first deploy Cloudflare creates the D1 database
   automatically and binds it as `DB`, because `wrangler.jsonc` has no
   `database_id`. Later deploys reuse the same database.
4. Open the `*.workers.dev` URL Cloudflare shows and check
   `/health`. It should return
   `{"ok":true,"db":"d1","bankQuestions":142,"date":"…"}`.

From then on, every merge to `main` deploys automatically, like Render did.

## Put it on honeydle.com

1. The **honeydle** Worker → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain** → `honeydle.com`. Add `www.honeydle.com` too if you like.
2. If honeydle.com is on Cloudflare (bought there, or its nameservers point
   there), Cloudflare creates the DNS records and certificate for you.
3. If you'd added DNS records for Render earlier, remove them first. That
   means the `www` CNAME to `usually-wnsi.onrender.com` and any A record for
   the bare domain.
4. Check https://honeydle.com/health.

## Retire Render

Once honeydle.com serves the Worker: Render dashboard → **usually** service →
**Suspend** (or delete), and delete the **usually-db** database. The old
Render data isn't moved over. It was test plays only, and the free database
was due to expire anyway.

## Changing the question bank safely

Never delete a question that has been used. Mark it `"retired": true` in
`data/bank.json` instead. New Dailies stop picking it, but a day that already
uses it keeps its set, so everyone who has answered stays answered and
in-progress games carry on. Every play also stores its own copy of its 7
questions, so finished games never change.

## Hand-picking a Daily (or letting a day be replayed)

`data/daily-overrides.json` pins a date's 7 questions:

```json
[{ "date": "2026-11-19", "ids": [183, 271, 191, 280, 279, 236, 301], "resetPlays": true }]
```

The ids must follow the Daily order (guess, guess, text, guess, guess, text,
finale). With `resetPlays: true`, every Daily play of that date, finished or
not, is cleared once, when the override is first applied, so everyone can
play the day again. Plays started after that are kept. An invalid entry is
skipped and logged.

## Free-tier notes

- **Workers Free:** 100,000 requests/day, no sleeping, no cold-start wait.
- **D1 Free:** 5 GB storage and millions of row reads a day. It doesn't
  expire.
- **Logs:** the Worker → **Observability** shows requests, errors and
  `console` output (enabled in `wrangler.jsonc`).

## Command line (optional)

```bash
npx wrangler login     # once
npm run deploy         # same as the dashboard deploy
npx wrangler d1 execute DB --remote --command "SELECT count(*) FROM hd_plays"
```
