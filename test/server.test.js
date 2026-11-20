// End-to-end over real HTTP against the real app: freeze, plays, scoring,
// secrecy, stats, yesterday, share, self-heal and resilience.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { startServer, bank, root, secretsFor, FORBIDDEN_KEYS, findKeys } from "./harness.js";
import { loadOverrides } from "../src/load.js";
import { composeSet, matchTextAnswer, MAX_SCORE } from "../src/game/index.js";

const byId = new Map(bank.map((q) => [q.id, q]));

/** A value that scores a Bullseye (or a chosen difference) for a question. */
function answerFor(q, offset = 0) {
  if (q.kind === "text") return offset === 0 ? q.top1 : q.textAnswers.at(-1).texts[0]; // the lowest-ranked real answer
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
    assert.deepEqual(r.json, { ok: true, db: "file", bankQuestions: 233, date: "2026-11-19" });
  });

  test("today: frozen 7-round set in public shape, deterministic from the date", async () => {
    const r = await s.call("/api/today");
    assert.equal(r.status, 200);
    assert.equal(r.json.questions.length, 7);
    assert.deepEqual(r.json.questions.map((q) => q.kind), ["guess", "guess", "text", "guess", "guess", "text", "finale"]);
    assert.deepEqual(r.json.questions.map((q) => q.id), (await s.store.getDailySet("2026-11-19")).ids, "frozen");
    assert.ok(r.json.questions.every((q) => !byId.get(q.id).exposed), "a fresh Daily uses unseen questions");
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

  test("text rounds: an exact answer scores by rank and reveals the top 3", async () => {
    const P = "u-texter000000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    for (let r = 0; r < 2; r++) {
      await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    }
    const q = byId.get(play.questions[2].id);
    const out = await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 2, value: q.top1.toUpperCase() } });
    assert.equal(out.json.result.rank, 1);
    assert.equal(out.json.result.points, 175);
    assert.equal(out.json.result.readBack, undefined);
    assert.deepEqual(out.json.result.top3, [1, 2, 3].map((r) => q.textAnswers.find((x) => x.rank === r).texts[0]));
    assert.deepEqual(findKeys(out.json, ["top1", "textAnswers", "unlisted", "matched"]), [], "never the full list");
  });

  test("text rounds: near misses come back as a suggestion to confirm; unlisted answers are refused", async () => {
    const whale = byId.get(202);
    const P = "u-whale0000000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    const stored = await s.store.getPlay(play.id);
    stored.snapshot[2] = whale; stored.questionIds[2] = 202;
    await s.store.savePlay(stored);
    for (let r = 0; r < 2; r++) await s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: 50 } });
    const submit = (value, extra = {}) => s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: 2, value, ...extra } });

    // not on the list: refused, round not used up
    const refused = (await submit("Megalodon")).json;
    assert.deepEqual([refused.refused, refused.result, refused.play], ["unlisted", undefined, undefined]);
    assert.match(refused.message, /not on the list/);
    // a partial or typo: the real answer comes back to put in the box, nothing scored
    assert.deepEqual((await submit("humpback")).json, { suggestion: "Humpback whale" });
    assert.deepEqual((await submit("humpbak whale")).json, { suggestion: "Humpback whale" });
    assert.equal((await s.store.getPlay(play.id)).results.length, 2, "suggestions never use up the round");
    // blank without a timeout is a plain error
    assert.equal((await submit("   ")).status, 400);
    // confirming the suggestion scores it
    const out = (await submit("Humpback whale")).json.result;
    assert.deepEqual([out.rank, out.points, out.tier], [8, 115, "Close"]);
    assert.equal(out.readBack, undefined);
    assert.equal(out.top3.length, 3);
  });

  test("text rounds: when time runs out, whatever was typed is scored", async () => {
    const P = "u-timeout00000000";
    const play = (await s.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
    const submit = (round, value, timedOut = true) => s.call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round, value, timedOut } });
    const g = (await submit(0, 50)).json.result;
    assert.equal(g.timedOut, true);
    await submit(1, 50, false);
    const blank = (await submit(2, "")).json.result;
    assert.deepEqual([blank.points, blank.tier, blank.timedOut], [0, "Blank", true]);
    await submit(3, 50); await submit(4, 50);
    const unl = (await submit(5, "qwertyuiop")).json.result;
    assert.deepEqual([unl.points, unl.tier, unl.rank], [10, "Way Off", null]);
    const q6 = byId.get(play.questions[5].id);
    assert.ok(unl.top3.includes(q6.top1));
  });

  test("stats: streak, games, best, average; Past games never touch the streak", async () => {
    const P = "u-streaker0000000";
    const t = await startServer({ at: "2026-11-24T15:00:00Z" });
    try {
      await t.call("/api/today"); // someone opens the 24th, so it becomes a past game later
      t.clock.addDays(1);
      const day = async (offsets) => {
        const p = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
        return (await playThrough(t.call, p, P, offsets)).play.score;
      };
      const s1 = await day([]);
      t.clock.addDays(1);
      const s2 = await day([30, 30, 1, 30, 30, 1, 30]);
      let st = (await t.call("/api/stats", { player: P })).json;
      assert.deepEqual(st, { streak: 2, games: 2, best: s1, avg: Math.round((s1 + s2) / 2) });
      // a past game counts as a game played, but not toward the streak, best or average
      const a = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date: "2026-11-24" } })).json;
      assert.equal(a.mode, "archive");
      await playThrough(t.call, a, P);
      st = (await t.call("/api/stats", { player: P })).json;
      assert.deepEqual(st, { streak: 2, games: 3, best: s1, avg: Math.round((s1 + s2) / 2) });
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

  test("past games: every earlier Daily, one play each, never today's or later", async () => {
    const t = await startServer({ at: "2026-11-19T15:00:00Z" });
    try {
      const P = "u-archivist000000";
      assert.deepEqual((await t.call("/api/archive", { player: P })).json.games, [], "nothing before the first Daily");
      await t.call("/api/today"); t.clock.addDays(1);
      const d20 = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json; // played on the day
      await playThrough(t.call, d20, P);
      t.clock.addDays(1);
      await t.call("/api/today"); // the 21st exists too, but it's today
      const list = (await t.call("/api/archive", { player: P })).json;
      assert.deepEqual(list.games.map((g) => [g.date, g.number, g.status, g.playedAs]),
        [["2026-11-20", 7, "done", "daily"], ["2026-11-19", 6, "new", null]], "newest first, today excluded");
      // play the 19th as a past game: same questions as that day's Daily
      const set19 = (await t.store.getDailySet("2026-11-19")).ids;
      const a = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date: "2026-11-19" } })).json;
      assert.deepEqual(a.questions.map((q) => q.id), set19);
      assert.equal(a.number, 6);
      assert.deepEqual(findKeys(a, FORBIDDEN_KEYS), [], "no answers before submit");
      const again = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date: "2026-11-19" } })).json;
      assert.equal(again.id, a.id, "one past-game play per day, resumable");
      await t.call(`/api/play/${a.id}/submit`, { method: "POST", player: P, body: { round: 0, value: 40 } });
      assert.equal((await t.call("/api/archive", { player: P })).json.games[1].status, "playing");
      // a day they played as its Daily comes back as that play
      assert.equal((await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date: "2026-11-20" } })).json.id, d20.id);
      // today, the future, nonsense and Endless are refused
      for (const date of ["2026-11-21", "2026-11-22", "2026-11-13", "nope", undefined]) {
        assert.equal((await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date } })).status, 400, String(date));
      }
      assert.equal((await t.call("/api/play", { method: "POST", player: P, body: { mode: "endless" } })).status, 400);
    } finally { await t.close(); }
  });

  test("the five hand-picked launch games are in Past games from day one", async () => {
    const overrides = loadOverrides(path.join(root, "data", "daily-overrides.json"), bank);
    const t = await startServer({ at: "2026-11-19T15:00:00Z", overrides });
    try {
      const P = "u-launchfan000000";
      const games = (await t.call("/api/archive", { player: P })).json.games;
      assert.deepEqual(games.map((g) => [g.date, g.number, g.status]), [
        ["2026-11-18", 5, "new"], ["2026-11-17", 4, "new"], ["2026-11-16", 3, "new"], ["2026-11-15", 2, "new"], ["2026-11-14", 1, "new"],
      ]);
      const pin = overrides.find((o) => o.date === "2026-11-14");
      const p = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "archive", date: "2026-11-14" } })).json;
      assert.deepEqual(p.questions.map((q) => q.id), pin.ids, "the hand-picked set");
      assert.deepEqual((await t.store.getDailySet("2026-11-14")).ids, pin.ids, "frozen on first open");
      // their questions are never picked for a new Daily
      const launchIds = new Set(overrides.filter((o) => o.date < "2026-11-19").flatMap((o) => o.ids));
      t.clock.set("2026-12-20T15:00:00Z");
      for (let d = 0; d < 10; d++) {
        for (const q of (await t.call("/api/today")).json.questions) assert.ok(!launchIds.has(q.id), `q${q.id} reused`);
        t.clock.addDays(1);
      }
    } finally { await t.close(); }
  });

  test("a new Daily never reuses a question from an earlier Daily, and prefers unseen ones", async () => {
    const t = await startServer({ at: "2026-12-20T15:00:00Z" });
    try {
      const seen = new Set();
      const fresh = bank.filter((q) => !q.retired && !q.exposed);
      for (let d = 0; d < 24; d++) {
        const ids = (await t.call("/api/today")).json.questions.map((q) => q.id);
        for (const id of ids) { assert.ok(!seen.has(id), `day ${d}: q${id} was already in an earlier Daily`); seen.add(id); }
        if (d < Math.floor(fresh.filter((q) => q.kind === "text").length / 2)) {
          assert.ok(ids.every((id) => !byId.get(id).exposed), `day ${d}: only unseen questions while they last`);
        }
        t.clock.addDays(1);
      }
    } finally { await t.close(); }
  });

  test("the Daily turns over at Eastern midnight", async () => {
    const t = await startServer({ at: "2026-11-20T04:30:00Z" }); // 23:30 Eastern on the 19th
    try {
      assert.equal((await t.call("/api/today")).json.date, "2026-11-19");
      t.clock.set("2026-11-20T05:01:00Z");
      const today = (await t.call("/api/today")).json;
      assert.equal(today.date, "2026-11-20");
      assert.deepEqual(today.questions.map((q) => q.id), (await t.store.getDailySet("2026-11-20")).ids);
      assert.notDeepEqual(today.questions.map((q) => q.id), (await t.store.getDailySet("2026-11-19")).ids);
    } finally { await t.close(); }
  });

  test("yesterday publishes real answers and text #1s, only for yesterday", async () => {
    const y = (await s.call("/api/yesterday")).json;
    assert.equal(y.date, "2026-11-18");
    assert.equal(y.rounds.length, 7);
    assert.deepEqual(y.rounds.map((r) => r.id), (await s.store.getDailySet("2026-11-18")).ids);
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
    assert.match(sh.text, /^Honeydle 2026-11-19\n.+\n🍯 \d+$/u);
    assert.doesNotMatch(sh.text, /1225/, "the max score is never shown");
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
    assert.equal((await s.call("/js/rules.js")).status, 200);
    assert.equal((await s.call("/../data/bank.json")).status, 200, "path traversal falls back to the app shell");
    assert.doesNotMatch((await s.call("/%2e%2e/data/bank.json")).text, /textAnswers/, "encoded traversal never escapes public/");
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

describe("hive hunt", () => {
  test("one list a day for everyone; hits, typos, repeats, misses and \"which one?\"", async () => {
    const t = await startServer({ at: "2026-11-21T15:00:00Z" });
    try {
      const P = "u-hunter000000000", Q = "u-hunter000000001";
      const a = (await t.call("/api/hunt", { player: P })).json;
      const b = (await t.call("/api/hunt", { player: Q })).json;
      assert.deepEqual([a.number, a.status, a.seconds], [2, "new", 60]);
      assert.deepEqual([a.prompt, a.total, b.prompt], [null, null, null], "the list is a surprise until the clock starts");
      const startedA = (await t.call("/api/hunt/start", { method: "POST", player: Q, body: {} })).json;
      assert.equal(startedA.prompt, "Name the 50 US states.", "revealed once started");
      assert.deepEqual(findKeys(a, ["entries", "missed", "unlisted"]), [], "the list never goes out before the end");
      assert.equal((await t.call("/api/hunt/guess", { method: "POST", player: P, body: { value: "texas" } })).status, 409, "start first");
      await t.call("/api/hunt/start", { method: "POST", player: P, body: {} });
      const g = async (value) => (await t.call("/api/hunt/guess", { method: "POST", player: P, body: { value } })).json;
      const first = await g("texas");
      assert.deepEqual([first.result, first.label, first.hunt.score], ["found", "Texas", 1]);
      const again = await g("Texas");
      assert.deepEqual([again.result, again.label], ["already", "Texas"]);
      assert.equal((await g("Californa")).label, "California", "typos are fine");
      assert.equal((await g("Ontario")).result, "miss");
      assert.equal((await g("carolina")).result, "ambiguous");
      const mid = (await t.call("/api/hunt", { player: P })).json;
      assert.equal(mid.status, "playing");
      assert.equal(mid.missed, undefined, "missed ones stay hidden while playing");
      assert.deepEqual(mid.found, ["Texas", "California"]);
    } finally { await t.close(); }
  });

  test("the clock is the server's: guesses after 60 seconds don't count, and the hunt ends", async () => {
    const t = await startServer({ at: "2026-11-21T15:00:00Z" });
    try {
      const P = "u-latehunter00000";
      await t.call("/api/hunt/start", { method: "POST", player: P, body: {} });
      await t.call("/api/hunt/guess", { method: "POST", player: P, body: { value: "ohio" } });
      t.clock.set("2026-11-21T15:01:05Z");
      const late = (await t.call("/api/hunt/guess", { method: "POST", player: P, body: { value: "texas" } })).json;
      assert.equal(late.result, "over");
      assert.equal(late.hunt.score, 1);
      assert.equal(late.hunt.missed.length, 49, "the rest is revealed once it's over");
      assert.deepEqual(late.hunt.missed, [...late.hunt.missed].sort((x, y) => x.localeCompare(y)), "alphabetical, never ranked");
      // restarting the same day gives back the finished hunt
      assert.equal((await t.call("/api/hunt/start", { method: "POST", player: P, body: {} })).json.status, "done");
      // a new day, a new list
      t.clock.addDays(1);
      const next = (await t.call("/api/hunt", { player: P })).json;
      assert.deepEqual([next.number, next.status], [3, "new"]);
      // and hunts never touch the Daily stats
      assert.deepEqual((await t.call("/api/stats", { player: P })).json, { streak: 0, games: 0, best: null, avg: null });
    } finally { await t.close(); }
  });

  test("finding every entry ends the hunt early; giving up ends it too", async () => {
    const t = await startServer({ at: "2026-11-29T15:00:00Z" }); // #10: Central America (7)
    try {
      const P = "u-completist0000";
      const s0 = (await t.call("/api/hunt/start", { method: "POST", player: P, body: {} })).json;
      assert.equal(s0.total, 7);
      let last;
      for (const v of ["Belize", "Costa Rica", "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama"]) {
        last = (await t.call("/api/hunt/guess", { method: "POST", player: P, body: { value: v } })).json;
      }
      assert.deepEqual([last.hunt.status, last.hunt.score, last.hunt.missed], ["done", 7, []]);
      const Q = "u-quitter0000000";
      await t.call("/api/hunt/start", { method: "POST", player: Q, body: {} });
      const done = (await t.call("/api/hunt/finish", { method: "POST", player: Q, body: {} })).json;
      assert.deepEqual([done.status, done.score, done.missed.length], ["done", 0, 7]);
    } finally { await t.close(); }
  });

  test("every list's spellings match their own entry, and nothing on its not-on-the-list list matches", async () => {
    const hunts = JSON.parse(fs.readFileSync(path.join(root, "data", "hunts.json"), "utf8"));
    assert.ok(hunts.lists.length >= 14);
    for (const l of hunts.lists) {
      const q = { textAnswers: l.entries.map((texts, i) => ({ rank: i + 1, texts })), unlisted: l.unlisted };
      for (const [i, texts] of l.entries.entries()) for (const v of texts) assert.equal(matchTextAnswer(q, v).rank, i + 1, `list ${l.id}: "${v}"`);
      for (const u of l.unlisted) assert.equal(matchTextAnswer(q, u).rank, null, `list ${l.id}: "${u}" must not match`);
    }
  });
});

describe("self-heal", () => {
  test("a short frozen set is recomposed and in-progress plays from it are discarded; completed plays are history", async () => {
    const t = await startServer();
    try {
      const date = "2026-11-19";
      const good = composeSet(bank, `heal:${date}`);
      // Simulate the real incident: a set that decayed to 3 rounds.
      await t.store.putDailySet(date, good.slice(0, 3), { replace: true });
      const broken = { id: "p-broken", playerId: "u-victim000000000", mode: "daily", date, questionIds: good.slice(0, 3), snapshot: good.slice(0, 3).map((id) => byId.get(id)), results: [], score: 0, completedAt: null };
      const finished = { id: "p-history", playerId: "u-veteran00000000", mode: "daily", date, questionIds: good.slice(0, 3), snapshot: [], results: [{ points: 5, tier: "Way Off" }], score: 5, completedAt: "2026-11-19T12:00:00Z" };
      await t.store.createPlay(broken);
      await t.store.createPlay(finished);

      const today = (await t.call("/api/today")).json;
      assert.equal(today.questions.length, 7);
      const healed = today.questions.map((q) => q.id);
      assert.deepEqual((await t.store.getDailySet(date)).ids, healed, "a full, valid set is frozen");
      assert.equal(await t.store.getPlay("p-broken"), null, "malformed in-progress play discarded");
      assert.ok(await t.store.getPlay("p-history"), "completed play kept");
      const victim = (await t.call("/api/play", { method: "POST", player: "u-victim000000000", body: { mode: "daily" } })).json;
      assert.equal(victim.questions.length, 7, "affected player gets a full game");

      // duplicated and stale-id sets heal too
      for (const bad of [[...good.slice(0, 6), good[0]], [...good.slice(0, 6), 987654]]) {
        await t.store.putDailySet(date, bad, { replace: true });
        const fixed = (await t.call("/api/today")).json.questions.map((q) => q.id);
        assert.equal(new Set(fixed).size, 7);
        assert.ok(!fixed.includes(987654));
      }
      // a healthy set is never rewritten
      const before = await t.store.getDailySet(date);
      await t.call("/api/today");
      assert.deepEqual(await t.store.getDailySet(date), before);
    } finally { await t.close(); }
  });

  test("a pinned Daily replaces the set and clears that day's plays exactly once", async () => {
    const date = "2026-11-19";
    const pin = { date, ids: [183, 271, 191, 280, 279, 236, 301], resetPlays: true };
    const t = await startServer({ overrides: [pin] });
    try {
      // a set and a finished play from before the override
      await t.store.putDailySet(date, composeSet(bank, `daily:${date}`), { replace: true });
      await t.store.createPlay({ id: "p-old", playerId: "u-replayer0000000", mode: "daily", date, questionIds: [], snapshot: [], results: [], score: 500, completedAt: "2026-11-19T12:00:00Z" });
      await t.store.createPlay({ id: "p-endless", playerId: "u-replayer0000000", mode: "endless", date, questionIds: [], snapshot: [], results: [], score: 0, completedAt: null });
      assert.deepEqual((await t.call("/api/today")).json.questions.map((q) => q.id), pin.ids);
      assert.equal(await t.store.getPlay("p-old"), null, "finished Daily cleared so it can be replayed");
      assert.ok(await t.store.getPlay("p-endless"), "Endless plays are untouched");
      // replay, finish, and the override must not wipe it again
      const p = (await t.call("/api/play", { method: "POST", player: "u-replayer0000000", body: { mode: "daily" } })).json;
      assert.equal(p.completed, false);
      assert.deepEqual(p.questions.map((q) => q.id), pin.ids);
      await t.call(`/api/play/${p.id}/submit`, { method: "POST", player: "u-replayer0000000", body: { round: 0, value: 33 } });
      await t.call("/api/today");
      assert.ok(await t.store.getPlay(p.id), "applied once: later reads keep new plays");
    } finally { await t.close(); }
  });

  test("swapping one question into a live day: nobody loses progress", async () => {
    const date = "2026-11-20";
    const before = [342, 350, 400, 308, 338, 377, 362];
    const after = [342, 350, 400, 308, 401, 377, 362];
    const t = await startServer({ at: "2026-11-20T15:00:00Z", overrides: [{ date, ids: before, resetPlays: false }] });
    const play = async (P, rounds) => {
      const p = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
      for (let r = 0; r < rounds; r++) {
        const q = byId.get(p.questions[r].id);
        await t.call(`/api/play/${p.id}/submit`, { method: "POST", player: P, body: { round: r, value: q.kind === "text" ? q.top1 : q.answer } });
      }
      return p.id;
    };
    try {
      const early = await play("u-swapearly000000", 2);   // hasn't reached round 5
      const late = await play("u-swaplate0000000", 6);    // already answered round 5
      const done = await play("u-swapdone0000000", 7);    // finished
      await t.close();
      // a deploy swaps round 5
      const t2 = await startServer({ at: "2026-11-20T16:00:00Z", store: t.store, overrides: [{ date, ids: after, resetPlays: false }] });
      try {
        assert.deepEqual((await t2.call("/api/today")).json.questions.map((q) => q.id), after);
        const e = await t2.store.getPlay(early);
        assert.deepEqual([e.results.length, e.questionIds[4], e.snapshot[4].id], [2, 401, 401], "unreached round gets the new question");
        const l = await t2.store.getPlay(late);
        assert.deepEqual([l.results.length, l.questionIds[4]], [6, 338], "an answered round keeps its question and score");
        const d = await t2.store.getPlay(done);
        assert.ok(d.completedAt, "finished games are history");
        assert.equal(d.questionIds[4], 338);
        // the early player carries on and meets the new question in round 5
        const resumed = (await t2.call("/api/play", { method: "POST", player: "u-swapearly000000", body: { mode: "daily" } })).json;
        assert.equal(resumed.questions[4].id, 401);
        assert.equal(resumed.round, 2);
      } finally { await t2.close(); }
    } catch (err) { await t.close().catch(() => {}); throw err; }
  });

  test("overrides: the shipped file is valid; bad entries are skipped", () => {
    const shipped = loadOverrides(path.join(root, "data", "daily-overrides.json"), bank);
    assert.ok(shipped.length >= 1);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hd-ov-"));
    const f = path.join(dir, "o.json");
    fs.writeFileSync(f, JSON.stringify([{ date: "2026-11-19", ids: [1, 2, 3] }, { date: "nope", ids: shipped[0].ids }, shipped[0]]));
    assert.deepEqual(loadOverrides(f, bank), [shipped[0]]);
    assert.deepEqual(loadOverrides(path.join(dir, "missing.json"), bank), []);
  });

  test("retiring a question never disturbs a day that already uses it, or anyone's play", async () => {
    // Simulate a deploy that retires a question in today's frozen set.
    const date = "2026-11-19";
    const set = [183, 271, 190, 280, 279, 236, 301]; // 190 is retired
    const t = await startServer();
    try {
      await t.store.putDailySet(date, set, { replace: true });
      const P = "u-midgame00000000";
      const p = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
      await t.call(`/api/play/${p.id}/submit`, { method: "POST", player: P, body: { round: 0, value: 33 } });
      assert.deepEqual((await t.call("/api/today")).json.questions.map((q) => q.id), set, "the frozen set is kept");
      const again = (await t.call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
      assert.equal(again.id, p.id, "the in-progress play is kept");
      assert.equal(again.round, 1, "with its answers");
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
      assert.equal(h.bankQuestions, 233);
      assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
    } finally { child.kill("SIGTERM"); }
  });
});
