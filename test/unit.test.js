// Pure game logic: scoring, validation, matching, composition, bee rules, bank quality.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as G from "../src/game/index.js";
import { loadBank, loadSchedule } from "../src/load.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bank = loadBank(path.join(root, "data", "bank.json"));
const byId = new Map(bank.map((q) => [q.id, q]));

test("difference tiers match the shipped curve exactly", () => {
  const cases = [[0, 175, "Divine"], [1, 150, "Golden Nectar"], [2, 135, "Golden Nectar"], [3, 135, "Golden Nectar"],
    [4, 115, "Sweet!"], [6, 115, "Sweet!"], [7, 95, "Sweet!"], [10, 95, "Sweet!"], [12, 95, "Sweet!"], [13, 70, "Bland"], [15, 70, "Bland"], [23, 70, "Bland"], [25, 70, "Bland"],
    [26, 40, "Bitter"], [40, 40, "Bitter"], [41, 10, "Yucky"], [50, 10, "Yucky"]];
  for (const [diff, pts, name] of cases) {
    const up = G.scoreNumeric(50, 50 + diff), down = G.scoreNumeric(50, 50 - diff);
    assert.deepEqual([up.points, up.tier, up.diff], [pts, name, diff], `diff +${diff}`);
    assert.deepEqual([down.points, down.tier], [pts, name], `diff -${diff}`);
  }
  assert.equal(G.scoreNumeric(0, 100).tier, "Yucky");
  assert.equal(G.MAX_SCORE, 1225);
  assert.equal(G.TIERS.length, 6, "six tiers");
  assert.ok(!G.TIERS.some((t) => ["Dead On", "One Off", "Razor Close", "Close", "Bullseye", "Hot", "Warm", "Lukewarm", "Cold", "Way Off"].includes(t.name)), "old tier names never return");
  assert.deepEqual(["Bullseye", "Hot", "Warm", "Lukewarm", "Cold", "Way Off"].map((n) => G.tierByName(n).name), ["Divine", "Golden Nectar", "Sweet!", "Bland", "Bitter", "Yucky"], "plays saved under the old names map to the new ones");
  // results saved under the old eight-tier names still show a bee and an emoji
  assert.equal(G.tierByName("One Off").name, "Golden Nectar");
  assert.equal(G.tierByName("Razor Close").name, "Golden Nectar");
  assert.equal(G.tierByName("Close").name, "Sweet!");
});

test("sub-1% answers are scored in hundredths on the same curve", () => {
  assert.equal(G.scoreNumeric(0.07, 0.07).tier, "Divine");
  assert.equal(G.scoreNumeric(0.07, 0.08).tier, "Golden Nectar");
  assert.equal(G.scoreNumeric(0.2, 0.24).tier, "Sweet!");
  assert.equal(G.scoreNumeric(0.01, 0.02).diff, 1);
  assert.equal(G.scoreNumeric(0.2, 1).diff, 80);
  assert.equal(G.scoreNumeric(0.29, 0.3).points, 150, "float noise never changes a tier");
});

test("text rank bands", () => {
  const cases = [[1, 175], [2, 150], [3, 150], [4, 135], [6, 135], [7, 115], [10, 115], [11, 95], [15, 95], [16, 70], [20, 70], [21, 40], [30, 40], [31, 10], [99, 10]];
  for (const [rank, pts] of cases) assert.equal(G.scoreRank(rank).points, pts, `rank ${rank}`);
  assert.deepEqual([2, 6, 7, 15, 16, 21, 31].map((r) => G.scoreRank(r).tier), ["Golden Nectar", "Golden Nectar", "Sweet!", "Sweet!", "Bland", "Bitter", "Yucky"]);
  assert.deepEqual(G.scoreRank(null), { points: 10, tier: "Yucky", rank: null });
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
  assert.equal(G.beeForRound(135), "golden");
  assert.equal(G.beeForRound(115), "honey");
  assert.equal(G.beeForRound(95), "honey");
  assert.equal(G.beeForRound(70), "lukewarm");
  assert.equal(G.beeForRound(40), "bitter");
  for (const p of [10, 0]) assert.equal(G.beeForRound(p), "yucky");
  // the last answer hands over to ruby only when the finished run goes over 1000
  assert.equal(G.beeForRound(40, { finalScore: 800 }), "ruby", "800 or more unlocks the hidden ruby bee");
  assert.equal(G.beeForRound(175, { finalScore: 799 }), "diamond");
  assert.equal(G.beeForRound(150, { finalScore: null }), "golden");
  assert.equal(G.isRuby(800, true), true);
  assert.equal(G.isRuby(799, true), false);
  assert.equal(G.isRuby(1200, false), false, "ruby is for a completed run only");
});

test("share card: tiers only, never answers", () => {
  const results = ["Divine", "Golden Nectar", "Sweet!", "Bland", "Bitter", "Yucky", "One Off"].map((tier) => ({ tier }));
  assert.equal(G.shareText("2026-11-19", results, 545), "Honeydle 2026-11-19\n💎✨😋😐😖🤢✨\n🍯 545");
  assert.equal(G.shareText("d", [{ tier: "Yucky" }, { tier: "Blank" }], 5), "Honeydle d\n🤢⬜\n🍯 5");
});

test("a question can carry a clarifying hint for players", () => {
  const island = byId.get(383);
  assert.match(G.publicQuestion(island).hint, /water on every side/);
  assert.equal(G.publicQuestion(byId.get(37)).hint, undefined, "no hint unless one is set");
});

test("public question shape carries no answer data", () => {
  for (const q of bank) {
    const p = G.publicQuestion(q);
    const allowed = ["id", "kind", "category", "text", "finale", "hint"];
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
  assert.equal(bank.length, 263, "retired questions stay in the file");
  const active = bank.filter((q) => !q.retired);
  assert.equal(active.length, 254);
  const count = (k) => active.filter((q) => G.poolOf(q) === k).length;
  assert.equal(count("guess"), 171);
  assert.equal(count("finale"), 31);
  const fresh = active.filter((q) => !q.exposed);
  assert.equal(fresh.length, 119, "119 brand-new questions nobody has seen");
  for (const id of [190, 192, 203, 257, 299, 80, 255, 338, 370]) assert.equal(bank.find((q) => q.id === id).retired, true, `q${id} retired`);
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
    if (!q.retired) assert.doesNotMatch(q.text, /\b(black|white|hispanic|latino|asian|race|racial|ethnic|indian or alaska native)\b(?! death| sea| hole| friday)/i, `q${q.id} is a race-based question: "${q.text}"`);
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

test("a guess of 50 when the answer is 27 is Bland, not Bitter", () => {
  assert.equal(G.scoreNumeric(27, 50).tier, "Bland");
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

test("matcher: joined, split and hyphenated words are understood", () => {
  const movie = byId.get(236);
  for (const typed of ["spider man", "spiderman", "Spider-Man", "SPIDERMAN", "starwars", "toystory", "harrypotter"]) {
    assert.equal(G.matchTextAnswer(movie, typed).ambiguous, true, `"${typed}" asks which one`);
  }
  assert.ok(G.groupSize(movie, "spiderman") >= 3, "the hint can say how many fit");
  assert.equal(G.matchTextAnswer(movie, "spiderman no way home").rank, G.matchTextAnswer(movie, "Spider-Man: No Way Home").rank);
  assert.equal(G.matchTextAnswer(movie, "lionking").rank, G.matchTextAnswer(movie, "The Lion King").rank);
  const caps = bank.find((q) => /US state capital/.test(q.text));
  for (const [typed, want] of [["saltlakecity", "Salt Lake City"], ["oklahomacity", "Oklahoma City"], ["st paul", "Saint Paul"], ["jeffersoncity", "Jefferson City"]]) {
    assert.equal(G.matchTextAnswer(caps, typed).rank, G.matchTextAnswer(caps, want).rank, typed);
  }
  const parks = bank.find((q) => /national park/.test(q.text));
  assert.equal(G.matchTextAnswer(parks, "mt rainier").rank, G.matchTextAnswer(parks, "Mount Rainier").rank);
  assert.equal(G.matchTextAnswer(parks, "grandcanyon").rank, 3);
  // a joined/split fix is a correction: the player confirms it like any autocorrect
  assert.notEqual(G.matchTextAnswer(caps, "saltlakecity").exact, true);
});

test("matcher: accents are ignored, never turned into spaces", () => {
  assert.equal(G.normalizeText("Hövsgöl"), "hovsgol");
  assert.equal(G.normalizeText("São Tomé"), "sao tome");
  assert.equal(G.normalizeText("Québec"), "quebec");
  const lakes = byId.get(204);
  assert.equal(G.matchTextAnswer(lakes, "hovsgol").rank, G.matchTextAnswer(lakes, "Lake Hövsgöl").rank);
});

test("every multi-word answer still matches when typed with words joined or split", () => {
  // Realistic forms only: any two neighbouring words glued, or a 2–3 word name typed as one word.
  // Skips website addresses (dots) and glues across little words like "of"/"the".
  const LITTLE = new Set(["of", "the", "and", "a", "an", "to", "in", "on", "de", "da", "u", "s"]);
  const hunts = JSON.parse(fs.readFileSync(path.join(root, "data", "hunts.json"), "utf8")).lists
    .map((l) => ({ id: `hunt ${l.id}`, textAnswers: l.entries.map((texts, i) => ({ rank: i + 1, texts })), unlisted: l.unlisted }));
  const fails = [];
  for (const q of [...bank.filter((x) => x.kind === "text" && !x.retired), ...hunts]) {
    for (const slot of q.textAnswers) for (const t of slot.texts) {
      if (t.includes(".")) continue;
      const toks = G.normalizeText(t).split(" ").filter(Boolean);
      if (toks.length < 2) continue;
      const forms = new Set();
      if (toks.length <= 3 && !toks.some((w) => LITTLE.has(w))) forms.add(toks.join(""));
      for (let i = 0; i + 1 < toks.length; i++) {
        if (LITTLE.has(toks[i]) || LITTLE.has(toks[i + 1])) continue;
        forms.add([...toks.slice(0, i), toks[i] + toks[i + 1], ...toks.slice(i + 2)].join(" "));
      }
      for (const f of forms) {
        const m = G.matchTextAnswer(q, f);
        if (m.rank !== slot.rank && !m.ambiguous) fails.push(`${q.id}: "${t}" typed "${f}" -> ${m.rank}`);
      }
    }
  }
  assert.deepEqual(fails, []);
});
