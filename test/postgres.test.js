// The Postgres store, exercised through the real app against an in-memory
// Postgres (pg-mem): schema, freeze, one-Daily-per-player, plays, stats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { createPostgresStore } from "../src/store/postgres.js";
import { startServer, bank } from "./harness.js";
import { composeSet } from "../src/game/index.js";

function memPostgres() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return createPostgresStore("postgres://localhost/honeydle", { Pool });
}

test("postgres store: full Daily round trip through the app", async () => {
  const t = await startServer({ store: memPostgres() });
  try {
    assert.equal((await t.call("/health")).json.db, "postgres");
    const today = (await t.call("/api/today")).json;
    assert.deepEqual(today.questions.map((q) => q.id), composeSet(bank, "daily:2026-11-19"));
    const P = "u-pgplayer0000000";
    const p1 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    const p2 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    assert.equal(p1.id, p2.id, "one Daily per player per day");
    for (let r = 0; r < 7; r++) {
      const q = bank.find((x) => x.id === p1.questions[r].id);
      const value = q.kind === "text" ? q.top1 : q.answer;
      const out = await t.call(`/api/play/${p1.id}/submit`, { method: "POST", player: P, body: { round: r, value } });
      assert.equal(out.status, 200, out.text);
    }
    const res = (await t.call("/api/results", { player: P })).json.play;
    assert.equal(res.completed, true);
    assert.equal(res.score, 1225);
    assert.deepEqual((await t.call("/api/stats", { player: P })).json, { streak: 1, games: 1, best: 1225, avg: 1225 });
    assert.match((await t.call("/api/share", { player: P })).json.text, /1225\/1225$/);
  } finally { await t.close(); }
});

test("postgres store: frozen set is first-writer-wins and heals with replace", async () => {
  const store = memPostgres();
  await store.init();
  const a = await store.putDailySet("2026-01-01", [1, 2, 3]);
  const b = await store.putDailySet("2026-01-01", [4, 5, 6]);
  assert.deepEqual(a.ids, [1, 2, 3]);
  assert.deepEqual(b.ids, [1, 2, 3], "a frozen set is never silently rewritten");
  const c = await store.putDailySet("2026-01-01", [7, 8, 9], { replace: true });
  assert.deepEqual(c.ids, [7, 8, 9]);
  await store.createPlay({ id: "p-1", playerId: "u-x", mode: "daily", date: "2026-01-01", questionIds: [7], snapshot: [], results: [], score: 0 });
  assert.deepEqual(await store.dailyPlaysInProgress("2026-01-01"), [{ id: "p-1", questionIds: [7] }]);
  await store.deletePlays(["p-1"]);
  assert.equal(await store.getPlay("p-1"), null);
  await store.close();
});

test("postgres store: coexists with the v1 schema in the same database", async () => {
  const db = newDb();
  // v1 left tables with these names behind; v2 must not depend on or break them.
  db.public.none(`CREATE TABLE daily_sets (play_date TEXT PRIMARY KEY, question_ids TEXT);
                  CREATE TABLE plays (id SERIAL PRIMARY KEY, player_id TEXT, mode TEXT, play_date TEXT);`);
  const { Pool } = db.adapters.createPg();
  const t = await startServer({ store: createPostgresStore("postgres://localhost/x", { Pool }) });
  try {
    const p = (await t.call("/api/play", { method: "POST", player: "u-legacy000000000", body: { mode: "daily" } })).json;
    assert.equal(p.questions.length, 7);
    const out = await t.call(`/api/play/${p.id}/submit`, { method: "POST", player: "u-legacy000000000", body: { round: 0, value: 50 } });
    assert.equal(out.status, 200, out.text);
  } finally { await t.close(); }
});
