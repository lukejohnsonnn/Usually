# Usually

Guess what percentage of people do things. Same 7 prompts for everyone,
one run a day. Free to play, free to host.

**Play:** Daily (7 rounds: guess, guess, text, split, split, text, finale),
Endless practice, and Contribute — vote on the real preference behind a
question to shape the crowd's numbers.

## Quick start
```bash
npm install
npm start        # http://localhost:3000
npm run verify   # 54 automated checks
```

## Deploy
See [DEPLOY.md](DEPLOY.md) — Render free tier, $0, no cron job.
Daily sets freeze lazily on first load each Eastern day.

## Verification
See [VERIFICATION.md](VERIFICATION.md) — what was tested, bank counts,
and the honest gaps (notably: the Postgres path hasn't run against a real
database yet; the first Render deploy is its test).

## Bank
119 verified questions (60 guess, 19 split, 10 finale, 30 text prompts),
harvested through the original game's published actions only.
Every stored answer was verified by submitting a guess in the live game.
See `data/bank.json` and `scripts/merge-bank.mjs`.
