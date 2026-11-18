// Regression test for PgStore.replaceDailySet + deleteStaleDailyPlays (db.js):
// the 2026-11-18 self-heal path. Runs against in-memory Postgres (pg-mem) via
// scripts/pg-mem-loader.mjs; exit code 0 = pass. Spawned by scripts/verify.js.
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = "postgres://test/test";
const { createStore } = await import(path.join(REPO, "db.js"));
const store = await createStore();
console.log("store kind:", store.kind);

const assert = (name, cond, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : " " + extra));
  if (!cond) process.exitCode = 1;
};

const DATE = "2026-11-18";
const MALFORMED = [70, 141, 113, 84, 49, 114, 42];
const HEALED = [205, 140, 202, 255, 243, 224, 43];

// replaceDailySet overwrites an existing malformed row...
await store.saveDailySet(DATE, MALFORMED);
assert("pre-seed malformed set stored", JSON.stringify(await store.getDailySet(DATE)) === JSON.stringify(MALFORMED));
await store.replaceDailySet(DATE, HEALED);
assert("replaceDailySet overwrites the malformed row", JSON.stringify(await store.getDailySet(DATE)) === JSON.stringify(HEALED));
// ...and creates a row when none exists (the missing-set heal path).
const DATE2 = "2026-11-19";
assert("missing date starts null", (await store.getDailySet(DATE2)) === null);
await store.replaceDailySet(DATE2, HEALED);
assert("replaceDailySet creates a missing row", JSON.stringify(await store.getDailySet(DATE2)) === JSON.stringify(HEALED));

// deleteStaleDailyPlays: drops daily plays whose questionIds != healed set,
// keeps plays on the healed set and plays on other dates/modes.
const mkPlay = (id, playerId, mode, playDate, questionIds, completed = false) => ({
  id, playerId, mode, playDate, questionIds,
  snapshot: questionIds.map((qid) => ({ id: qid, kind: "guess", answer: 50, textAnswers: null, unlisted: null, top1: null })),
  results: [], score: 0, completed,
});
await store.createPlay(mkPlay("stale-1", "p1", "daily", DATE, [141, 49, 42], true));
await store.createPlay(mkPlay("stale-2", "p2", "daily", DATE, MALFORMED));
await store.createPlay(mkPlay("good-1", "p3", "daily", DATE, HEALED));
await store.createPlay(mkPlay("other-date", "p1", "daily", DATE2, [141, 49, 42], true));
await store.createPlay(mkPlay("endless-1", "p1", "endless", DATE, [141, 49, 42]));
const dropped = await store.deleteStaleDailyPlays(DATE, HEALED);
assert("deleteStaleDailyPlays drops exactly the 2 stale daily plays", dropped === 2, `dropped=${dropped}`);
assert("stale completed play gone", (await store.getPlay("stale-1")) === null);
assert("stale in-progress play gone", (await store.getPlay("stale-2")) === null);
assert("play on healed set kept", (await store.getPlay("good-1")) !== null);
assert("play on another date kept", (await store.getPlay("other-date")) !== null);
assert("endless play kept", (await store.getPlay("endless-1")) !== null);
// Second call is a no-op: nothing left to drop.
assert("deleteStaleDailyPlays is idempotent", (await store.deleteStaleDailyPlays(DATE, HEALED)) === 0);
