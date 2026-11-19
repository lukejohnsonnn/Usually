# Honeydle

**How well do you know the world?** A free daily guessing game built on real
published statistics. Everyone gets the same 7 prompts each day, plays once
and scores out of 1225.

| Round | Kind | The player… |
|---|---|---|
| 1, 2 | Guess the % | estimates a percentage |
| 3, 6 | Name the #1 | types the top answer on a ranked list |
| 4, 5 | Split the 100 | divides 100 between two sides |
| 7 | Finale | a Guess round from the obscure, small-answer pool |

Endless practice uses the same composition with a fresh random set each time.

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

On a Split round the comb shows white (left side) and amber (right side), with
your share in yellow. Below 1%, the reveal zooms in so each cell is 0.01%.

## Run it

```bash
npm install
npm start            # http://localhost:3000, JSON file store in data/local.json
npm test             # 33 checks: game logic, HTTP end to end, Postgres store
npm run test:ui      # 6 browser checks with Playwright (one-screen rule, full Daily…)
npm run verify       # both
```

With `DATABASE_URL` set, the server uses Postgres instead of the file store.

## How it's built

```
server.js              boot: bank, store, self-heal, listen
src/game/rules.js      pure rules: scoring tiers, validation, composition, dates, bee rules
src/game/match.js      the text-answer matcher (autocorrect that never guesses on a tie)
src/service.js         Daily freeze + self-heal, plays, submit-and-score, stats, yesterday, share
src/app.js             Express routes, rate limit, JSON errors
src/store/file.js      local JSON store        ┐ same interface
src/store/postgres.js  production Postgres     ┘
public/                the client: vanilla ES modules, no build step
data/bank.json         142 questions, each with a real published source
tools/                 pixel-frame generator, screenshot script
test/                  unit, server, postgres (pg-mem) and browser tests
```

- **Answers never reach the browser before you submit.** The public question
  shape is id, kind, category, text, split labels and the finale flag. Answers
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
| `POST /api/play` `{mode: "daily"\|"endless"}` | start or resume a play |
| `POST /api/play/:id/submit` `{round, value}` | score the next round |
| `GET /api/results[?date=]` | the player's Daily play |
| `GET /api/stats` | streak, games, best, average |
| `GET /api/yesterday` | yesterday's rounds with answers |
| `GET /api/share[?date=]` | the plain-text share card |

## Deploy

See [DEPLOY.md](DEPLOY.md). It deploys to the Render free tier for $0, with no cron job.
