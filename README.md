# Crowdle

How well do you know people? Guess what percentage of people do things.
Same 7 prompts for everyone, one run a day. Free to play, free to host.

**Play:** Daily (7 rounds: guess, guess, text, split, split, text, finale),
Endless practice, and Contribute — vote on the real preference behind a
question to shape the crowd's numbers.

## Quick start
```bash
npm install
npm start        # http://localhost:3000
npm run verify   # 164 automated checks
```

## Deploy
See [DEPLOY.md](DEPLOY.md) — Render free tier, $0, no cron job.
Daily sets freeze lazily on first load each Eastern day.

## Verification
See [VERIFICATION.md](VERIFICATION.md) — what was tested, bank counts,
and the honest gaps.

## Bank
142 questions (72 guess, 10 finale, 25 split, 35 text prompts).
Every question carries a researched source — a real published statistic
(survey, census, government stat, or peer-reviewed figure).
See `data/bank.json` and `scripts/merge-bank.mjs`.
