// Pure game logic: scoring, validation, matching, composition, bee rules, bank quality.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "../src/game/index.js";
import { loadBank, loadSchedule } from "../src/load.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bank = loadBank(path.join(root, "data", "bank.json"));
const byId = new Map(bank.map((q) => [q.id, q]));

test("difference tiers match the shipped curve exactly", () => {
  const cases = [[0, 175, "Bullseye"], [1, 150, "One Off"], [2, 135, "Razor Close"], [3, 135, "Razor Close"],
    [4, 115, "Close"], [6, 115, "Close"], [7, 95, "Warm"], [10, 95, "Warm"], [12, 95, "Warm"], [13, 70, "Lukewarm"], [15, 70, "Lukewarm"], [23, 70, "Lukewarm"], [25, 70, "Lukewarm"],
    [26, 40, "Cold"], [40, 40, "Cold"], [41, 10, "Way Off"], [50, 10, "Way Off"]];
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
  assert.equal(G.scoreNumeric(0.29, 0.3).points, 150, "float noise never changes a tier");
});

test("text rank bands", () => {
  const cases = [[1, 175], [2, 150], [3, 150], [4, 135], [6, 135], [7, 115], [10, 115], [11, 95], [15, 95], [16, 70], [20, 70], [21, 40], [30, 40], [31, 10], [99, 10]];
  for (const [rank, pts] of cases) assert.equal(G.scoreRank(rank).points, pts, `rank ${rank}`);
  assert.deepEqual(G.scoreRank(null), { points: 10, tier: "Way Off", rank: null });
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

test("bee rules: one bee per tier, Bullseye is diamond, ruby over 1000", () => {
  assert.equal(G.beeForRound(175), "diamond");
  assert.equal(G.beeForRound(150), "golden");
  assert.equal(G.beeForRound(135), "honey");
  assert.equal(G.beeForRound(115), "drop");
  assert.equal(G.beeForRound(95), "normal");
  for (const p of [70, 40, 10, 0]) assert.equal(G.beeForRound(p), "thirsty");
  // the last answer hands over to ruby only when the finished run goes over 1000
  assert.equal(G.beeForRound(40, { finalScore: 800 }), "ruby", "800 or more unlocks the hidden ruby bee");
  assert.equal(G.beeForRound(175, { finalScore: 799 }), "diamond");
  assert.equal(G.beeForRound(150, { finalScore: null }), "golden");
  assert.equal(G.isRuby(800, true), true);
  assert.equal(G.isRuby(799, true), false);
  assert.equal(G.isRuby(1200, false), false, "ruby is for a completed run only");
});

test("share card: tiers only, never answers", () => {
  const results = ["Bullseye", "One Off", "Razor Close", "Close", "Warm", "Lukewarm", "Cold"].map((tier) => ({ tier }));
  assert.equal(G.shareText("2026-11-19", results, 545), "Honeydle 2026-11-19\n🎯✅🔥🙂😐😬🥶\n🍯 545");
  assert.equal(G.shareText("d", [{ tier: "Way Off" }, { tier: "Blank" }], 5), "Honeydle d\n❌⬜\n🍯 5");
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
  assert.deepEqual(G.matchTextAnswer(q, "whale"), { rank: null, matched: null, ambiguous: true }, "a group, not an answer: which one?");
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
  assert.equal(bank.length, 240, "retired questions stay in the file");
  const active = bank.filter((q) => !q.retired);
  assert.equal(active.length, 233);
  const count = (k) => active.filter((q) => G.poolOf(q) === k).length;
  assert.equal(count("guess"), 156);
  assert.equal(count("finale"), 25);
  const fresh = active.filter((q) => !q.exposed);
  assert.equal(fresh.length, 98, "98 brand-new questions nobody has seen");
  for (const id of [190, 192, 203, 257, 299, 80, 255]) assert.equal(bank.find((q) => q.id === id).retired, true, `q${id} retired`);
  assert.ok(!bank.some((q) => q.kind === "split" || "leftLabel" in q || "rightLabel" in q), "no Split questions remain");
  assert.equal(count("text"), 52);
  for (const q of bank) {
    assert.ok(q.source && q.source.length > 10, `q${q.id} has a source`);
    assert.ok(!("votable" in q), `q${q.id} has no voting field`);
    assert.doesNotMatch(`${q.text} ${q.category} ${q.note || ""}`, /crowd/i, `q${q.id} has no "crowd" theming`);
    if (q.kind === "text") {
      // older lists are long open lists; the new ones are complete closed lists (every planet, every state…)
      if (q.exposed) assert.ok(q.textAnswers.length >= 76 && q.textAnswers.length <= 100, `q${q.id} has 76–100 ranks`);
      else assert.ok(q.textAnswers.length >= 6, `q${q.id} has a real list`);
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

test("a sharp run reaches the ruby bee; a mediocre one does not", () => {
  const decent = [3, 5, 4, 6, 2].map((d) => G.scoreNumeric(50, 50 + d).points);
  const text = [G.scoreRank(2).points, G.scoreRank(5).points];
  const total = [...decent, ...text].reduce((a, b) => a + b, 0);
  assert.ok(total >= G.RUBY_THRESHOLD, `a sharp run (within ~5 everywhere) scores ${total} and finds the ruby bee`);
  const mediocre = [10, 12, 8, 15, 9].map((d) => G.scoreNumeric(50, 50 + d).points).concat(G.scoreRank(12).points, G.scoreRank(25).points);
  const m = mediocre.reduce((a, b) => a + b, 0);
  assert.ok(m >= 500 && m < G.RUBY_THRESHOLD, `mediocre run scores ${m}, no ruby`);
});

test("bank: no self-assessment, belief-poll or duplicate prompts", () => {
  for (const q of bank) {
    assert.doesNotMatch(q.text, /think they could|believe|would give up|could do a random/i, `q${q.id} "${q.text}"`);
  }
  const texts = bank.map((q) => q.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length, "no duplicate prompts");
});

test("matcher: a group name asks which one, a specific answer is matched", () => {
  const movie = bank.find((q) => q.id === 236);
  const war = bank.find((q) => q.id === 191);
  for (const [q, typed] of [[movie, "star wars"], [movie, "harry potter"], [war, "war"], [war, "world war"], [war, "civil war"]]) {
    assert.equal(G.matchTextAnswer(q, typed).ambiguous, true, `"${typed}" asks which one`);
  }
  assert.equal(G.matchTextAnswer(movie, "avatar").rank, 1);
  assert.equal(G.matchTextAnswer(movie, "star wars force awakens").rank, movie.textAnswers.find((s) => /Force Awakens/.test(s.texts[0])).rank);
  assert.equal(G.matchTextAnswer(war, "world war two").rank, 1);
  assert.equal(G.matchTextAnswer(war, "ww1").rank, war.textAnswers.find((s) => s.texts[0] === "World War I").rank);
});

test("composition never picks a retired question", () => {
  const retired = new Set(bank.filter((q) => q.retired).map((q) => q.id));
  for (let d = 0; d < 300; d++) {
    for (const id of G.composeSet(bank, `daily:${G.addDays("2027-01-01", d)}`)) assert.ok(!retired.has(id), `day ${d} picked retired q${id}`);
  }
  assert.ok(G.isValidSet([183, 271, 190, 280, 279, 236, 301], bank), "a set that already uses a retired question stays valid");
});

test("a guess of 50 when the answer is 27 is Lukewarm, not Cold", () => {
  assert.equal(G.scoreNumeric(27, 50).tier, "Lukewarm");
});

test("schedule: the next two weeks are brand-new questions, each used once, in Daily order", () => {
  const days = loadSchedule(path.join(root, "data", "schedule.json"), bank);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, "2026-11-20");
  assert.equal(days.at(-1).date, "2026-12-03");
  const all = days.flatMap((d) => d.ids);
  assert.equal(new Set(all).size, 98, "no question twice");
  for (const d of days) {
    assert.ok(G.isValidSet(d.ids, bank), `${d.date} is a valid Daily`);
    for (const id of d.ids) {
      const q = byId.get(id);
      assert.ok(!q.exposed && !q.retired, `${d.date}: q${id} is brand new`);
    }
    assert.equal(d.resetPlays, false, "the schedule never clears anyone's game");
  }
  // none of these were ever in Endless practice or an earlier Daily
  const seenBefore = new Set(bank.filter((q) => q.exposed).map((q) => q.id));
  assert.ok(all.every((id) => !seenBefore.has(id)));
});
