// Pure game logic: scoring, validation, matching, composition, bee rules, bank quality.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "../src/game/index.js";
import { loadBank } from "../src/service.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bank = loadBank(path.join(root, "data", "bank.json"));
const byId = new Map(bank.map((q) => [q.id, q]));

test("difference tiers match the shipped curve exactly", () => {
  const cases = [[0, 175, "Bullseye"], [1, 100, "One Off"], [2, 90, "Razor Close"], [3, 90, "Razor Close"],
    [4, 75, "Close"], [6, 75, "Close"], [7, 55, "Warm"], [10, 55, "Warm"], [11, 35, "Lukewarm"], [15, 35, "Lukewarm"],
    [16, 15, "Cold"], [25, 15, "Cold"], [26, 5, "Way Off"], [50, 5, "Way Off"]];
  for (const [diff, pts, name] of cases) {
    const up = G.scoreNumeric(50, 50 + diff), down = G.scoreNumeric(50, 50 - diff);
    assert.deepEqual([up.points, up.tier, up.diff], [pts, name, diff], `diff +${diff}`);
    assert.deepEqual([down.points, down.tier], [pts, name], `diff -${diff}`);
  }
  assert.equal(G.scoreNumeric(0, 100).tier, "Way Off");
  assert.equal(G.MAX_SCORE, 1225);
  assert.ok(!G.TIERS.some((t) => t.name === "Dead On"), "the old tier name never returns");
});

test("sub-1% answers are scored in hundredths on the same curve", () => {
  assert.equal(G.scoreNumeric(0.07, 0.07).tier, "Bullseye");
  assert.equal(G.scoreNumeric(0.07, 0.08).tier, "One Off");
  assert.equal(G.scoreNumeric(0.2, 0.24).tier, "Close");
  assert.equal(G.scoreNumeric(0.01, 0.02).diff, 1);
  assert.equal(G.scoreNumeric(0.2, 1).diff, 80);
  assert.equal(G.scoreNumeric(0.29, 0.3).points, 100, "float noise never changes a tier");
});

test("text rank bands", () => {
  const cases = [[1, 175], [2, 100], [3, 100], [4, 90], [6, 90], [7, 75], [10, 75], [11, 55], [15, 55], [16, 35], [20, 35], [21, 15], [30, 15], [31, 5], [99, 5]];
  for (const [rank, pts] of cases) assert.equal(G.scoreRank(rank).points, pts, `rank ${rank}`);
  assert.deepEqual(G.scoreRank(null), { points: 5, tier: "Way Off", rank: null });
  assert.deepEqual(G.scoreRank(null, true), { points: 0, tier: "Blank", rank: null });
});

test("guess validation", () => {
  for (const ok of [0, 1, 50, 100, 0.01, 0.07, 0.25, 0.99, "0.07", "42"]) assert.equal(G.validateGuess(ok), null, `accepts ${ok}`);
  for (const bad of [-1, 101, 1.5, 50.5, 0.071, 0.005, "abc", "", null, undefined, NaN, Infinity]) assert.ok(G.validateGuess(bad), `rejects ${bad}`);
  assert.equal(G.cleanGuess("0.07"), 0.07);
});

test("composition: fixed order, deterministic, valid, never short", () => {
  const a = G.composeSet(bank, "daily:2026-11-19");
  const b = G.composeSet(bank, "daily:2026-11-19");
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, G.composeSet(bank, "daily:2026-11-20"));
  assert.deepEqual(a.map((id) => G.poolOf(byId.get(id))), G.ROUND_KINDS);
  assert.deepEqual(G.ROUND_KINDS, ["guess", "guess", "text", "guess", "guess", "text", "finale"]);
  assert.ok(G.isValidSet(a, bank));
  // bank order must not matter
  assert.deepEqual(G.composeSet([...bank].reverse(), "daily:2026-11-19"), a);
  for (let d = 0; d < 400; d++) assert.ok(G.isValidSet(G.composeSet(bank, `daily:${G.addDays("2026-01-01", d)}`), bank));
  const noFinale = bank.filter((q) => !q.finale);
  assert.throws(() => G.composeSet(noFinale, "x"), /pool ran dry/);
  const oneText = bank.filter((q) => q.kind !== "text").concat(bank.filter((q) => q.kind === "text").slice(0, 1));
  assert.throws(() => G.composeSet(oneText, "x"), /pool ran dry/);
});

test("set validity catches short, duplicated, stale and mis-ordered sets", () => {
  const good = G.composeSet(bank, "s");
  assert.equal(G.isValidSet(good.slice(0, 3), bank), false);
  assert.equal(G.isValidSet([...good.slice(0, 6), good[0]], bank), false);
  assert.equal(G.isValidSet([...good.slice(0, 6), 999999], bank), false);
  assert.equal(G.isValidSet([good[2], ...good.slice(1, 2), good[0], ...good.slice(3)], bank), false);
  assert.equal(G.isValidSet(null, bank), false);
});

test("Eastern dates", () => {
  assert.equal(G.easternDate(new Date("2026-11-19T04:59:00Z")), "2026-11-18");
  assert.equal(G.easternDate(new Date("2026-11-19T05:00:00Z")), "2026-11-19");
  assert.equal(G.easternDate(new Date("2026-07-04T03:59:00Z")), "2026-07-03", "daylight time");
  assert.equal(G.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(G.addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(G.isDateStr("2026-11-19"));
  assert.ok(!G.isDateStr("2026-02-30"));
  assert.ok(!G.isDateStr("yesterday"));
});

test("bee rules: diamond streak and ruby finish", () => {
  const r = (...pts) => pts.map((points) => ({ points }));
  assert.equal(G.bullseyeStreak(r(175)), 1);
  assert.equal(G.bullseyeStreak(r(175, 175)), 2);
  assert.equal(G.bullseyeStreak(r(175, 175, 90, 175)), 1, "any sub-175 resets");
  assert.equal(G.beeForRound(175, 1), "golden");
  assert.equal(G.beeForRound(175, 2), "diamond");
  assert.equal(G.beeForRound(175, 5), "diamond");
  assert.equal(G.beeForRound(100, 0), "honey");
  assert.equal(G.beeForRound(90, 0), "drop");
  assert.equal(G.beeForRound(75, 0), "normal");
  assert.equal(G.beeForRound(55, 0), "normal");
  for (const p of [35, 15, 5, 0]) assert.equal(G.beeForRound(p, 0), "thirsty");
  assert.equal(G.isRuby(900, true), true);
  assert.equal(G.isRuby(899, true), false);
  assert.equal(G.isRuby(1000, false), false, "ruby is for a completed run only");
});

test("share card: tiers only, never answers", () => {
  const results = ["Bullseye", "One Off", "Razor Close", "Close", "Warm", "Lukewarm", "Cold"].map((tier) => ({ tier }));
  assert.equal(G.shareText("2026-11-19", results, 545), "Honeydle 2026-11-19\n🎯✅🔥🙂😐😬🥶\n545/1225");
  assert.equal(G.shareText("d", [{ tier: "Way Off" }, { tier: "Blank" }], 5), "Honeydle d\n❌⬜\n5/1225");
});

test("public question shape carries no answer data", () => {
  for (const q of bank) {
    const p = G.publicQuestion(q);
    const allowed = ["id", "kind", "category", "text", "finale"];
    assert.deepEqual(Object.keys(p).filter((k) => !allowed.includes(k)), [], `q${q.id}`);
  }
});

test("matcher: the whale worked example", () => {
  const q = byId.get(202);
  assert.equal(G.matchTextAnswer(q, "whale").rank, 1, "curated alias");
  assert.equal(G.matchTextAnswer(q, "humpback").rank, 8);
  assert.equal(G.matchTextAnswer(q, "fin").rank, 4);
  assert.equal(G.matchTextAnswer(q, "blue").rank, 1);
  assert.equal(G.matchTextAnswer(q, "humpback").autocorrected, true);
  for (const ambiguous of ["shark", "right whale", "elephant"]) {
    assert.equal(G.matchTextAnswer(q, ambiguous).rank, null, `${ambiguous} stays unlisted`);
  }
  assert.equal(G.matchTextAnswer(q, "Megalodon").rank, null, "explicit unlisted");
  assert.equal(G.matchTextAnswer(q, "   ").blank, true);
});

test("matcher: forgiving about typing, conservative about meaning", () => {
  const lang = byId.get(235);
  assert.equal(G.matchTextAnswer(lang, "english").rank, 1);
  assert.equal(G.matchTextAnswer(lang, "  ENGLISH!! ").rank, 1);
  assert.equal(G.matchTextAnswer(lang, "englsh").rank, 1, "typo");
  assert.equal(G.matchTextAnswer(lang, "spanish").rank, 4);
  assert.equal(G.matchTextAnswer(lang, "klingon").rank, null);
});

test("bank meets the standard", () => {
  assert.equal(bank.length, 142);
  const count = (k) => bank.filter((q) => G.poolOf(q) === k).length;
  assert.equal(count("guess"), 97);
  assert.equal(count("finale"), 10);
  assert.ok(!bank.some((q) => q.kind === "split" || "leftLabel" in q || "rightLabel" in q), "no Split questions remain");
  assert.equal(count("text"), 35);
  for (const q of bank) {
    assert.ok(q.source && q.source.length > 10, `q${q.id} has a source`);
    assert.ok(!("votable" in q), `q${q.id} has no voting field`);
    assert.doesNotMatch(`${q.text} ${q.category} ${q.note || ""}`, /crowd/i, `q${q.id} has no "crowd" theming`);
    if (q.kind === "text") {
      assert.ok(q.textAnswers.length >= 76 && q.textAnswers.length <= 100, `q${q.id} has 76–100 ranks`);
      const ranks = q.textAnswers.map((s) => s.rank);
      assert.deepEqual(ranks, ranks.map((_, i) => i + 1), `q${q.id} ranks are 1..n`);
      assert.equal(G.matchTextAnswer(q, q.top1).rank, 1, `q${q.id} top1 label matches rank 1`);
      // every rank's own display label must match its own rank
      for (const slot of q.textAnswers) {
        assert.equal(G.matchTextAnswer(q, slot.texts[0]).rank, slot.rank, `q${q.id} "${slot.texts[0]}"`);
      }
      for (const u of q.unlisted || []) assert.equal(G.matchTextAnswer(q, u).rank, null, `q${q.id} unlisted "${u}"`);
    } else {
      assert.equal(G.validateGuess(q.answer), null, `q${q.id} answer is valid input`);
    }
  }
});
