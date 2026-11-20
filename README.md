# Honeydle

**How well do you know the world?** A free daily guessing game built on real
published statistics. Everyone gets the same 7 prompts each day, plays once
and scores out of 1225.

| Round | Kind | The player… |
|---|---|---|
| 1, 2, 4, 5 | Guess the % | estimates a percentage |
| 3, 6 | Name the #1 | types the top answer on a ranked list |
| 7 | Finale | a Guess round from the obscure, small-answer pool |

**Past games** lets players replay any earlier Daily they missed (once each;
it doesn't count toward the streak). Every Daily uses questions that have never
been in an earlier Daily, so Past games can never preview tomorrow.

## The honeycomb

The signature piece is a comb of **100 hexagonal wax cells in ten rows of
ten**, with alternate rows nested half a cell over like a real comb. Each
cell is 1% and each row is 10%, and honey fills from the bottom row up. It's
drawn as pixel art at native resolution and scaled with
`image-rendering: pixelated`, so it stays sharp on any screen. The same
component shows the guess while you answer and the reveal afterwards:

| Cell | Meaning |
|---|---|
| dark wax | empty |
| white | the real number only |
| dark with a yellow ring | your guess only |
| solid honey yellow (glowing) | overlap, the cells you got |

Below 1%, the reveal zooms in so each cell is 0.01%.

## Run it

```bash
npm install
npm start            # Node dev server on http://localhost:3000 (JSON file store)
npm run dev          # the real Worker locally via wrangler (local D1)
npm test             # 44 checks: game logic, HTTP end to end, D1 store
npm run test:ui      # 12 browser checks with Playwright (one-screen rule, full Daily…)
npm run test:worker  # 6 checks against the real Worker under wrangler dev
npm run verify       # all of the above
```

## How it's built

```
src/worker.js          Cloudflare Worker entry: API + static assets + D1
server.js              local Node dev server (same handler, file store)
public/js/rules.js     pure rules shared by browser and server: tiers, validation, composition, dates, bees
src/game/match.js      the text-answer matcher (autocorrect that never guesses on a tie)
src/service.js         Daily freeze + self-heal + overrides, plays, scoring, stats, yesterday, share
src/http.js            fetch-style routes, rate limit, JSON errors (runs on Workers and Node)
src/store/d1.js        production store: Cloudflare D1   ┐ same interface
src/store/file.js      local JSON store                  ┘
public/                the client: vanilla ES modules, no build step
data/bank.json         240 questions (233 active), each with a real published source
data/schedule.json     the upcoming Dailies (brand-new questions, each used once)
data/daily-overrides.json  hand-picked Daily sets
tools/content/         the question source files and the schedule builder
wrangler.jsonc         Worker, D1 and assets config
tools/                 pixel-frame generator, screenshot script
test/                  unit, server, D1, browser and Worker tests
```

- **Answers never reach the browser before you submit.** The public question
  shape is id, kind, category, text and the finale flag. Answers
  are copied into the play record on the server and scored there. A text
  round's #1 label is only ever sent by *Yesterday's answers*.
- **The Daily** is composed deterministically from the Eastern date, frozen on
  the first request of the day, and checked on every read. A missing, short,
  duplicated or stale set is recomposed, and any in-progress plays built from
  it are discarded so those players get a full 7-round game.
- **No accounts.** The browser makes an anonymous `u-…` id, stored in
  localStorage and sent as `x-player-id`.

### API

| Endpoint | Purpose |
|---|---|
| `GET /health` | status, store, bank size, Eastern date |
| `GET /api/today` | today's frozen set (public shape) |
| `POST /api/play` `{mode: "daily"\|"archive", date?}` | start or resume today's Daily, or a past one |
| `GET /api/archive` | Past games: every earlier Daily with the player's result |
| `POST /api/play/:id/submit` `{round, value}` | score the next round |
| `GET /api/results[?date=]` | the player's Daily play |
| `GET /api/stats` | streak, games, best, average |
| `GET /api/yesterday` | yesterday's rounds with answers |
| `GET /api/share[?date=]` | the plain-text share card |

## Deploy

See [DEPLOY.md](DEPLOY.md). It runs on Cloudflare Workers + D1, free, with no cron job.
