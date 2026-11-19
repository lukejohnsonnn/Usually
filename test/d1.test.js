// The D1 store against a real local D1 database (Cloudflare's workerd/Miniflare
// via wrangler's getPlatformProxy), driven through the full game service.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { createD1Store } from "../src/store/d1.js";
import { startServer, bank, root } from "./harness.js";
import { composeSet } from "../src/game/index.js";

let proxy;
before(async () => {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "hd-d1-"));
  proxy = await getPlatformProxy({ configPath: path.join(root, "wrangler.jsonc"), persist: { path: persist } });
});
after(async () => { await proxy?.dispose(); });

test("d1 store: full Daily round trip through the app", async () => {
  const t = await startServer({ store: createD1Store(proxy.env.DB) });
  try {
    assert.equal((await t.call("/health")).json.db, "d1");
    const today = (await t.call("/api/today")).json;
    assert.deepEqual(today.questions.map((q) => q.id), composeSet(bank, "daily:2026-11-19"));
    const P = "u-d1player0000000";
    const p1 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    const p2 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    assert.equal(p1.id, p2.id, "one Daily per player per day");
    for (let r = 0; r < 7; r++) {
      const q = bank.find((x) => x.id === p1.questions[r].id);
      const out = await t.call(`/api/play/${p1.id}/submit`, { method: "POST", player: P, body: { round: r, value: q.kind === "text" ? q.top1 : q.answer } });
      assert.equal(out.status, 200, out.text);
    }
    const res = (await t.call("/api/results", { player: P })).json.play;
    assert.equal(res.completed, true);
    assert.equal(res.score, 1225);
    assert.deepEqual((await t.call("/api/stats", { player: P })).json, { streak: 1, games: 1, best: 1225, avg: 1225 });
    assert.match((await t.call("/api/share", { player: P })).json.text, /1225\/1225$/);
    // Endless plays don't collide with the one-Daily rule
    const e1 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    const e2 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    assert.notEqual(e1.id, e2.id);
  } finally { await t.close(); }
});

test("d1 store: first-writer-wins freeze, replace, play cleanup", async () => {
  const store = createD1Store(proxy.env.DB);
  assert.deepEqual((await store.putDailySet("2030-01-01", [1, 2, 3])).ids, [1, 2, 3]);
  assert.deepEqual((await store.putDailySet("2030-01-01", [4, 5, 6])).ids, [1, 2, 3], "never silently rewritten");
  assert.deepEqual((await store.putDailySet("2030-01-01", [7, 8, 9], { replace: true })).ids, [7, 8, 9]);
  const base = { playerId: "u-x", date: "2030-01-01", questionIds: [7], snapshot: [], results: [], score: 0 };
  await store.createPlay({ ...base, id: "p-a", mode: "daily" });
  await store.createPlay({ ...base, id: "p-b", mode: "daily", playerId: "u-y", completedAt: "2030-01-01T10:00:00Z" });
  assert.deepEqual(await store.dailyPlaysInProgress("2030-01-01"), [{ id: "p-a", questionIds: [7] }]);
  assert.deepEqual((await store.dailyPlayIds("2030-01-01")).sort(), ["p-a", "p-b"]);
  await store.deletePlays(["p-a", "p-b"]);
  assert.equal(await store.getPlay("p-a"), null);
  assert.deepEqual(await store.dailyPlayIds("2030-01-01"), []);
});

test("d1 store: the self-heal and the pinned-Daily override work on D1", async () => {
  const date = "2026-11-19";
  const pin = { date, ids: [183, 271, 191, 280, 279, 236, 301], resetPlays: true };
  const store = createD1Store(proxy.env.DB);
  await store.putDailySet(date, [1, 2, 3], { replace: true }); // a broken set
  await store.createPlay({ id: "p-old", playerId: "u-old", mode: "daily", date, questionIds: [1, 2, 3], snapshot: [], results: [], score: 9, completedAt: "2026-11-19T09:00:00Z" });
  const t = await startServer({ store, overrides: [pin] });
  try {
    assert.deepEqual((await t.call("/api/today")).json.questions.map((q) => q.id), pin.ids);
    assert.equal(await store.getPlay("p-old"), null);
  } finally { await t.close(); }
});
