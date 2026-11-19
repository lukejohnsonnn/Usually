// End-to-end over real HTTP against the real app: freeze, plays, scoring,
// secrecy, stats, yesterday, share, self-heal and resilience.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { startServer, bank, root, secretsFor, FORBIDDEN_KEYS, findKeys } from "./harness.js";
import { composeSet, matchTextAnswer, MAX_SCORE } from "../src/game/index.js";

const byId = new Map(bank.map((q) => [q.id, q]));

/** A value that scores a Bullseye (or a chosen difference) for a question. */
function answerFor(q, offset = 0) {
  if (q.kind === "text") return offset === 0 ? q.top1 : "zzzz not a thing";
  const a = q.answer;
  if (a < 1) return Math.min(0.99, Math.round((a + offset / 100) * 100) / 100);
  return Math.min(100, Math.max(0, a + offset));
}

async function playThrough(call, play, player, offsets = []) {
  let last;
  for (let r = play.round; r < 7; r++) {
    const q = byId.get(play.questions[r].id);
    last = await call(`/api/play/${play.id}/submit`, { method: "POST", player, body: { round: r, value: answerFor(q, offsets[r] || 0) } });
    assert.equal(last.status, 200, last.text);
  }
  return last.json;
}

describe("server", () => {
  let s;
  before(async () => { s = await startServer(); });
  after(async () => { await s.close(); });

  test("health reports status, store, bank size and Eastern date", async () => {
    const r = await s.call("/health");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, db: "file", bankQuestions: 142, date: "2026-11-19" });
  });

  test("today: frozen 7-round set in public shape, deterministic from the date", async () => {
    const r = await s.call("/api/today");
    assert.equal(r.status, 200);
    assert.equal(r.json.questions.length, 7);
    assert.deepEqual(r.json.questions.map((q) => q.kind), ["guess", "guess", "text", "guess", "guess", "text", "finale"]);
    assert.deepEqual(r.json.questions.map((q) => q.id), composeSet(bank, "daily:2026-11-19"));
    assert.deepEqual(findKeys(r.json, FORBIDDEN_KEYS), []);
    for (const secret of secretsFor(r.json.questions.map((q) => q.id))) assert.ok(!r.text.includes(secret), `leaks "${secret}"`);
  });

  test("player id is required and validated", async () => {
    assert.equal((await s.call("/api/play", { method: "POST", body: { mode: "daily" }, player: null })).status, 400);
    assert.equal((await s.call("/api/play", { method: "POST", body: { mode: "daily" }, player: "bob" })).status, 400);
    assert.equal((await s.call("/api/stats", { player: "u-short" })).status, 400);
    assert.equal((await s.call("/api/play", { method: "POST", body: { mode: "weekly" } })).status, 400);
  });

  test("a Daily: same for everyone, resumable, locked rounds, never replayable", async () => {
    const A = "u-alice0000000000", B = "u-bobby0000000000";
    const pa = (await s.call("/api/play", { method: "POST", player: A, body: { mode: "daily" } })).json;
    const pb = (await s.call("/api/play", { method: "POST", player: B, body: { mode: "daily" } })).json;
    assert.deepEqual(pa.questions, pb.questions);
    assert.notEqual(pa.id, pb.id);
    assert.deepEqual(findKeys(pa, FORBIDDEN_KEYS), []);
    for (const secret of secretsFor(pa.questions.map((q) => q.id))) assert.ok(!JSON.stringify(pa).includes(secret));

    // out-of-order and foreign submits are refused
    assert.equal((await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: A, body: { round: 1, value: 50 } })).status, 409);
    assert.equal((await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: B, body: { round: 0, value: 50 } })).status, 404);
    // invalid input is a plain error and does not consume the round
    for (const bad of [101, -1, 12.5, 0.005, "abc", null]) {
      const r = await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: A, body: { round: 0, value: bad } });
      assert.equal(r.status, 400, `rejects ${bad}`);
      assert.ok(r.json.error);
    }
    // round 1 then resume
    const q0 = byId.get(pa.questions[0].id);
    const r0 = await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: A, body: { round: 0, value: q0.answer } });
    assert.equal(r0.json.result.points, 175);
    assert.equal(r0.json.result.tier, "Bullseye");
    assert.equal(r0.json.result.answer, q0.answer, "answer revealed only after submit");
    assert.equal((await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: A, body: { round: 0, value: 1 } })).status, 409, "submitted round is locked");
    const resumed = (await s.call("/api/play", { method: "POST", player: A, body: { mode: "daily" } })).json;
    assert.equal(resumed.id, pa.id);
    assert.equal(resumed.round, 1);

    const done = await playThrough(s.call, resumed, A);
    assert.equal(done.play.completed, true);
    assert.equal(done.play.score, MAX_SCORE);
    assert.equal((await s.call(`/api/play/${pa.id}/submit`, { method: "POST", player: A, body: { round: 7, value: 1 } })).status, 409);
    const again = (await s.call("/api/play", { method: "POST", player: A, body: { mode: "daily" } })).json;
    assert.equal(again.id, pa.id);
    assert.equal(again.completed, true, "finished Daily cannot be replayed");
    const res = (await s.call("/api/results", { player: A })).json;
    assert.equal(res.play.score, 1225);
    assert.equal(res.play.results.length, 7);
  });

  test("diamond streak: 2nd consecutive Bullseye in the same play", async () => {
    const P = "u-diamond00000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    const streaks = [];
    const offsets = [0, 0, 0, 10, 0, 0, 0];
    for (let r = 0; r < 7; r++) {
      const q = byId.get(play.questions[r].id);
      const out = (await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: answerFor(q, offsets[r]) } })).json;
      streaks.push(out.result.streak);
    }
    assert.deepEqual(streaks, [1, 2, 3, 0, 1, 2, 3]);
  });

  test("text rounds: rank scoring, read-back for partials, the #1 label never leaves the server", async () => {
    const P = "u-texter000000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    for (let r = 0; r < 2; r++) {
      await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    }
    const q = byId.get(play.questions[2].id);
    const out = await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 2, value: q.top1.toUpperCase() } });
    assert.equal(out.json.result.rank, 1);
    assert.equal(out.json.result.points, 175);
    assert.equal(out.json.result.readBack, undefined);
    assert.deepEqual(findKeys(out.json, ["top1", "textAnswers", "unlisted", "matched"]), []);
    const leaks = out.text.split(q.top1.toUpperCase()).length - 1;
    assert.equal(leaks, 2, "the #1 only appears as the player's own typed text (result + play results)");
  });

  test("text read-back only for autocorrected ranks 2 and lower", async () => {
    const whale = byId.get(202);
    // Drive the service directly with a play whose round 3 is the whale question.
    const P = "u-whale0000000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    const stored = await s.store.getPlay(play.id);
    stored.snapshot[2] = whale; stored.questionIds[2] = 202;
    await s.store.savePlay(stored);
    for (let r = 0; r < 2; r++) await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    const out = (await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 2, value: "humpback" } })).json.result;
    assert.equal(out.rank, 8);
    assert.equal(out.readBack, "Humpback whale");
    assert.equal(matchTextAnswer(whale, "whale").rank, 1);
  });

  test("blank text scores 0 server-side; unlisted scores 5", async () => {
    const P = "u-blank0000000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
    for (let r = 0; r < 2; r++) await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    const blank = (await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 2, value: "   " } })).json.result;
    assert.deepEqual([blank.points, blank.tier], [0, "Blank"]);
    for (const r of [3, 4]) await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    const unl = (await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 5, value: "qwertyuiop" } })).json.result;
    assert.deepEqual([unl.points, unl.tier, unl.rank], [5, "Way Off", null]);
  });

  test("stats: streak, games, best, average; Endless never touches the streak", async () => {
    const P = "u-streaker0000000";
    const t = await startServer({ at: "2026-11-10T15:00:00Z" });
    try {
      const day = async (offsets) => {
        const p = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
        return (await playThrough(t.call, p, P, offsets)).play.score;
      };
      const s1 = await day([]);
      t.clock.addDays(1);
      const s2 = await day([30, 30, 1, 30, 30, 1, 30]);
      let st = (await t.call("/api/stats", { player: P })).json;
      assert.deepEqual(st, { streak: 2, games: 2, best: s1, avg: Math.round((s1 + s2) / 2) });
      // Endless counts as a game but not toward Daily stats
      const e = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).json;
      await playThrough(t.call, e, P);
      st = (await t.call("/api/stats", { player: P })).json;
      assert.equal(st.games, 3);
      assert.equal(st.streak, 2);
      // next day, not yet played: streak still counts back from yesterday
      t.clock.addDays(1);
      assert.equal((await t.call("/api/stats", { player: P })).json.streak, 2);
      // skip a day: streak resets
      t.clock.addDays(1);
      assert.equal((await t.call("/api/stats", { player: P })).json.streak, 0);
      // a fresh player
      assert.deepEqual((await t.call("/api/stats", { player: "u-nobody000000000" })).json, { streak: 0, games: 0, best: null, avg: null });
    } finally { await t.close(); }
  });

  test("the Daily turns over at Eastern midnight", async () => {
    const t = await startServer({ at: "2026-11-20T04:30:00Z" }); // 23:30 Eastern on the 19th
    try {
      assert.equal((await t.call("/api/today")).json.date, "2026-11-19");
      t.clock.set("2026-11-20T05:01:00Z");
      const today = (await t.call("/api/today")).json;
      assert.equal(today.date, "2026-11-20");
      assert.deepEqual(today.questions.map((q) => q.id), composeSet(bank, "daily:2026-11-20"));
    } finally { await t.close(); }
  });

  test("yesterday publishes real answers and text #1s, only for yesterday", async () => {
    const y = (await s.call("/api/yesterday")).json;
    assert.equal(y.date, "2026-11-18");
    assert.equal(y.rounds.length, 7);
    const ids = composeSet(bank, "daily:2026-11-18");
    assert.deepEqual(y.rounds.map((r) => r.id), ids);
    for (const r of y.rounds) {
      const q = byId.get(r.id);
      if (q.kind === "text") { assert.equal(r.top1, q.top1); assert.equal(r.textAnswers, undefined); }
      else assert.equal(r.answer, q.answer);
    }
  });

  test("share: plain-text card for a completed Daily only", async () => {
    const P = "u-sharer000000000";
    assert.equal((await s.call("/api/share", { player: P })).status, 404);
    const p = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    await playThrough(s.call, p, P, [1, 0, 0, 2, 5, 0, 0]);
    const sh = (await s.call("/api/share", { player: P })).json;
    assert.match(sh.text, /^Honeydle 2026-11-19\n.+\n\d+\/1225$/u);
    assert.equal([...sh.text.split("\n")[1]].length > 0, true);
    for (const secret of secretsFor(p.questions.map((q) => q.id))) assert.ok(!sh.text.includes(secret));
    assert.equal((await s.call("/api/share?date=nope", { player: P })).status, 400);
  });

  test("resilience: bad JSON, unknown routes and store failures return JSON and the server stays up", async () => {
    const bad = await s.call("/api/play", { method: "POST", raw: "{nope" });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.error);
    assert.equal((await s.call("/api/nothing")).status, 404);
    const orig = s.store.completedPlays;
    s.store.completedPlays = async () => { throw new Error("db exploded"); };
    const boom = await s.call("/api/stats");
    s.store.completedPlays = orig;
    assert.equal(boom.status, 500);
    assert.ok(boom.json.error);
    assert.equal((await s.call("/health")).status, 200, "still alive");
  });

  test("static client is served, with the SPA fallback", async () => {
    const home = await s.call("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /<div id="app">/);
    assert.equal((await s.call("/js/app.js")).status, 200);
    assert.equal((await s.call("/shared/rules.js")).status, 200);
    assert.equal((await s.call("/src/service.js")).status, 200, "unknown paths fall back to the app shell…");
    assert.doesNotMatch((await s.call("/src/service.js")).text, /createService/, "…never server source");
    assert.doesNotMatch((await s.call("/data/bank.json")).text, /textAnswers/, "the bank is never served");
  });

  test("rate limit guards the API", async () => {
    const t = await startServer({ rateLimit: 5 });
    try {
      const codes = [];
      for (let i = 0; i < 7; i++) codes.push((await t.call("/api/today")).status);
      assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
      assert.equal((await t.call("/health")).status, 200, "health is never rate limited");
    } finally { await t.close(); }
  });
});

describe("self-heal", () => {
  test("a short frozen set is recomposed and in-progress plays from it are discarded; completed plays are history", async () => {
    const t = await startServer();
    try {
      const date = "2026-11-19";
      const good = composeSet(bank, `daily:${date}`);
      // Simulate the real incident: a set that decayed to 3 rounds.
      await t.store.putDailySet(date, good.slice(0, 3), { replace: true });
      const broken = { id: "p-broken", playerId: "u-victim000000000", mode: "daily", date, questionIds: good.slice(0, 3), snapshot: good.slice(0, 3).map((id) => byId.get(id)), results: [], score: 0, completedAt: null };
      const finished = { id: "p-history", playerId: "u-veteran00000000", mode: "daily", date, questionIds: good.slice(0, 3), snapshot: [], results: [{ points: 5, tier: "Way Off" }], score: 5, completedAt: "2026-11-19T12:00:00Z" };
      await t.store.createPlay(broken);
      await t.store.createPlay(finished);

      const today = (await t.call("/api/today")).json;
      assert.equal(today.questions.length, 7);
      assert.deepEqual(today.questions.map((q) => q.id), good);
      assert.equal(await t.store.getPlay("p-broken"), null, "malformed in-progress play discarded");
      assert.ok(await t.store.getPlay("p-history"), "completed play kept");
      const victim = (await t.call("/api/play", { method: "POST", player: "u-victim000000000", body: { mode: "daily" } })).json;
      assert.equal(victim.questions.length, 7, "affected player gets a full game");

      // duplicated and stale-id sets heal too
      for (const bad of [[...good.slice(0, 6), good[0]], [...good.slice(0, 6), 987654]]) {
        await t.store.putDailySet(date, bad, { replace: true });
        assert.deepEqual((await t.call("/api/today")).json.questions.map((q) => q.id), good);
      }
      // a healthy set is never rewritten
      const before = await t.store.getDailySet(date);
      await t.call("/api/today");
      assert.deepEqual(await t.store.getDailySet(date), before);
    } finally { await t.close(); }
  });

  test("concurrent first requests freeze exactly one set", async () => {
    const t = await startServer({ at: "2026-12-25T15:00:00Z" });
    try {
      const all = await Promise.all(Array.from({ length: 20 }, () => t.call("/api/today")));
      const sets = new Set(all.map((r) => JSON.stringify(r.json.questions.map((q) => q.id))));
      assert.equal(sets.size, 1);
      const plays = await Promise.all(Array.from({ length: 10 }, () => t.call("/api/play", { method: "POST", player: "u-racer0000000000", body: { mode: "daily" } })));
      assert.equal(new Set(plays.map((p) => p.json.id)).size, 1, "one Daily play per player per day");
    } finally { await t.close(); }
  });
});

describe("the real process", () => {
  test("node server.js boots with the file store and serves health", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "honeydle-"));
    const port = 40000 + Math.floor(Math.random() * 10000);
    const child = spawn(process.execPath, ["server.js"], {
      cwd: root, env: { ...process.env, PORT: String(port), DATABASE_URL: "", LOCAL_DATA_PATH: path.join(dir, "db.json") }, stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      let out = "";
      child.stdout.on("data", (d) => { out += d; });
      for (let i = 0; i < 50 && !out.includes("Honeydle on"); i++) await new Promise((r) => setTimeout(r, 100));
      const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      assert.equal(h.ok, true);
      assert.equal(h.bankQuestions, 142);
      assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
    } finally { child.kill("SIGTERM"); }
  });
});
