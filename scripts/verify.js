// End-to-end verification for Usually. Spawns the real server against a throwaway
// local file store, plays a full daily + endless, and checks Contribute, the
// freeze, stats, and scoring. Run: npm run verify  (or: node scripts/verify.js)
// Exit 0 = all checks passed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  scoreGuess, scoreText, matchTextAnswer, normalizeText, canonicalTokens,
  composeSet, etDateStr, addDays, deriveVotePrompt,
} from "../lib/game.js";
import { loadBank } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3457;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = "/tmp/usually-verify-local.json";
const bank = loadBank();
const byId = new Map(bank.questions.map((q) => [q.id, q]));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

// ---------------------------------------------------------- unit: scoring
console.log("== unit: scoring ==");
check("exact guess = 175 Bullseye", JSON.stringify(scoreGuess(57, 57)) === JSON.stringify({ points: 175, tier: "Bullseye", diff: 0 }));
check("1 off = 100 Dead On", scoreGuess(57, 58).points === 100 && scoreGuess(57, 58).tier === "Dead On");
check("2-3 off = 90", scoreGuess(57, 60).points === 90);
check("4-6 off = 75", scoreGuess(57, 62).points === 75);
check("7-10 off = 55", scoreGuess(57, 65).points === 55);
check("11-15 off = 35", scoreGuess(57, 70).points === 35);
check("16-25 off = 15", scoreGuess(57, 80).points === 15);
check("26+ off = 5", scoreGuess(57, 90).points === 5);
check("hundredths: 0.2 vs 0.21 = 100", scoreGuess(0.2, 0.21).points === 100);
check("hundredths: 0.2 vs 0.2 = 175", scoreGuess(0.2, 0.2).points === 175);
check("hundredths: 0.2 vs 0.80 = 5", scoreGuess(0.2, 0.8).points === 5);
check("hundredths: 0.01 vs 0.02 = 100", scoreGuess(0.01, 0.02).points === 100);
check("text rank 1 = 175", scoreText(1).points === 175);
check("text rank 2-3 = 100", scoreText(3).points === 100);
check("text rank 4-6 = 90", scoreText(5).points === 90);
check("text rank 31+ = 5", scoreText(33).points === 5);
check("text unlisted = 5", scoreText(null).points === 5);
check("text blank = 0", scoreText(null, true).points === 0);

console.log("== unit: text matching ==");
const q105 = byId.get(105);
check("exact match pepperoni rank 1", matchTextAnswer(q105, "Pepperoni").rank === 1);
check("case-insensitive", matchTextAnswer(q105, "PEPPERONI").rank === 1);
check("typo forgiven (peperoni)", matchTextAnswer(q105, "peperoni").rank === 1);
check("plural forgiven", matchTextAnswer(byId.get(127), "phones").rank === 1);
check("unlisted stays unlisted", matchTextAnswer(byId.get(106), "my horoscope told me not to go").rank === null);
check("alias: my car broke down = rank 5", matchTextAnswer(byId.get(106), "my car broke down").rank === 5);
check("normalize strips articles", normalizeText("A phone screen") === "phone screen");
// 2026-11-17 autocorrect matching: synonyms, word order, filler words,
// abbreviations, typos (Damerau transpositions) — with guards so distinct
// answers in the same list are never conflated. [qid, submitted, wantRank]
const MATCH_CASES = [
  [131, "lucky chram", 13], [131, "lucky charm", 13], [131, "good luck charm", 13],
  [127, "my phone", 1], [127, "cell phone", 1], [127, "CELL PHONE", 1],
  [127, "smartphone", 1], [127, "mobile", 1],
  [127, "house keys", 2], [127, "my keys", 2], [127, "keys", 2],
  [127, "money", 4], [127, "my wallet", 3],
  [104, "keys", 2],
  [120, "dog", 1], [120, "my dog", 1], [120, "their dog", 1],
  [120, "keys", 21], [120, "their keys", 21],
  [128, "phone screen", 1], [128, "cracked phone screen", 1], [128, "a phone screen", 1],
  [128, "wine glasses", 5], [128, "laptop screen", 6],
  [119, "butterflies", 1], [119, "butterfly", 1],
  [125, "fresh baked bread", 1], [125, "freshly baked bread", 1],
  [132, "singing", 1], [132, "sing", 1],
  [130, "kale", 1],
  [105, "pepperoni pizza", 1], [103, "make coffee", 5],
  [180, "light blue", 31], [176, "chocolate ice cream", 1],
  [179, "frenchie", 1], [106, "overslept", 2], [116, "manual", 1],
  [110, "flying", 2], [110, "being able to fly", 2], [110, "fly", 2],
  [110, "time travelling", 4], [110, "traveling in time", 4],
  [110, "living forever", 10], [110, "never dying", 10],
  [111, "fast food", 1],
  [131, "keys", null], [131, "keychain", null],
  [177, "hot dog", null], [177, "dog", 1],
  [128, "phone", null], [128, "screen", null],
  [128, "glasses", 2], [128, "sunglasses", 2],
  [112, "key fob", 28],
  [104, "keys to the office", 32],
  [103, "check my phone", 1], [103, "check their phone", 1],
  [103, "check the time", 6],
  [180, "blue", 1],
  [176, "chocolate", 1],
  [179, "french bulldog", 1],
  [113, "paris", 1], [113, "paris france", 1],
  [108, "snakes", 1], [108, "snake", 1],
  [106, "traffic", 1], [106, "stuck in traffic", 1],
  [124, "math", 1],
  [116, "owner's manual", 1], [116, "owners manual", 1],
  [121, "phone", 1],
  [122, "dust", 1],
  [123, "hot sauce", 1],
  [126, "baby crying", 1], [126, "a baby crying", 1],
  [129, "the dog ate it", 1], [129, "dog ate it", 1], [129, "dog ate my homework", 1],
  [115, "mac and cheese", 1], [115, "macaroni and cheese", 1],
  [117, "hide and seek", 1], [117, "hide-and-seek", 1],
  [118, "toilet paper", 1],
  [178, "stuffing", 1],
  [107, "tape", 1],
  [109, "ford mustang", 1], [109, "mustang", 1],
  [114, "toasted sandwich maker", 1],
];
{
  const bad = [];
  for (const [id, sub, want] of MATCH_CASES) {
    const got = matchTextAnswer(byId.get(id), sub).rank;
    if (got !== want) bad.push(`Q${id} "${sub}": got ${got}, want ${want}`);
  }
  check(`autocorrect matching suite (${MATCH_CASES.length} paraphrase/synonym/typo/guard cases)`, bad.length === 0, bad.join(" | "));
}

console.log("== unit: daily composition / freeze ==");
const today = etDateStr();
const setA = composeSet(bank.questions, `daily:${today}`);
const setB = composeSet(bank.questions, `daily:${today}`);
check("same date = same set (frozen)", JSON.stringify(setA) === JSON.stringify(setB));
check("set shape guess,guess,text,split,split,text,finale",
  byId.get(setA[0]).kind === "guess" && byId.get(setA[1]).kind === "guess" &&
  byId.get(setA[2]).kind === "text" && byId.get(setA[3]).kind === "split" &&
  byId.get(setA[4]).kind === "split" && byId.get(setA[5]).kind === "text" &&
  byId.get(setA[6]).finale === true);
check("different date = different set", JSON.stringify(setA) !== JSON.stringify(composeSet(bank.questions, `daily:${addDays(today, 1)}`)));
check("no repeats within a set", new Set(setA).size === 7);
check("vote prompt derived for guess", deriveVotePrompt(byId.get(3)).length > 3);
check("vote prompt for split", deriveVotePrompt(byId.get(44)) === "Pick your side");

console.log("== unit: 2026-11-16 sync fixes ==");
check("Australia finale retired from bank", !bank.questions.some((q) => /australian/i.test(q.text)));
check("half-court reframed to NBA fans, answer 41 (2026-11-16 audit)",
  byId.get(142)?.text === "What % of NBA fans think they could sink a half-court shot?" && byId.get(142)?.answer === 41);
check("half-court vote prompt matches reframed text",
  byId.get(142)?.votePrompt === "Could you sink a half-court shot?");
check("bank is 142 questions (72 guess, 25 split, 10 finale, 35 text) after 2026-11-16 audit",
  bank.questions.length === 142 &&
  bank.questions.filter((q) => q.kind === "guess" && !q.finale).length === 72 &&
  bank.questions.filter((q) => q.kind === "split").length === 25 &&
  bank.questions.filter((q) => q.finale).length === 10 &&
  bank.questions.filter((q) => q.kind === "text").length === 35);
// 2026-11-16 research audit — researched answers are authoritative, never voted:
check("audit: every guess/split answer is representable (0.01–100)",
  bank.questions.filter((q) => q.kind !== "text").every((q) => q.answer != null && q.answer >= 0.01 && q.answer <= 100));
check("audit: every question has a cited source",
  bank.questions.every((q) => typeof q.source === "string" && q.source.length > 10));
check("audit: meta counts match the bank",
  bank.meta.counts.total === bank.questions.length &&
  bank.meta.counts.guess === bank.questions.filter((q) => q.kind === "guess" && !q.finale).length &&
  bank.meta.counts.split === bank.questions.filter((q) => q.kind === "split").length &&
  bank.meta.counts.finale === bank.questions.filter((q) => q.finale).length &&
  bank.meta.counts.text === bank.questions.filter((q) => q.kind === "text").length &&
  bank.meta.counts.votable === bank.questions.filter((q) => q.votable).length);
check("audit: every text list is 75+ contiguous ranks with top1 at rank 1",
  bank.questions.filter((q) => q.kind === "text").every((q) => {
    const ranks = (q.textAnswers || []).map((a) => a.rank);
    return ranks.length >= 75 && ranks.every((r, i) => r === i + 1) &&
      q.top1 === (q.textAnswers.find((a) => a.rank === 1)?.texts || [])[0] &&
      q.textAnswers.every((a) => a.texts && a.texts.length > 0);
  }));
// 2026-11-17 autocorrect expansion: no two ranks in a prompt may share a
// canonical variant (the matcher refuses to guess on a tie), every stored
// canonical must match back to its own rank, and no unlisted entry may be
// an answer that is actually listed (the unlisted check runs first).
check("text lists: no duplicate canonical variant across ranks in a prompt",
  bank.questions.filter((q) => q.kind === "text").every((q) => {
    const seen = new Map();
    for (const slot of q.textAnswers) for (const t of slot.texts) {
      const key = canonicalTokens(t).join(" ");
      if (seen.has(key) && seen.get(key) !== slot.rank) return false;
      seen.set(key, slot.rank);
    }
    return true;
  }));
check("text lists: every canonical text matches its own rank",
  bank.questions.filter((q) => q.kind === "text").every((q) =>
    q.textAnswers.every((a) => matchTextAnswer(q, a.texts[0]).rank === a.rank)));
check("text lists: no unlisted entry is actually a listed answer",
  bank.questions.filter((q) => q.kind === "text").every((q) => {
    const listed = new Set();
    for (const slot of q.textAnswers) for (const t of slot.texts) listed.add(canonicalTokens(t).join(" "));
    return (q.unlisted || []).every((u) => !listed.has(canonicalTokens(u).join(" ")));
  }));
check("audit: 10-vote live-answer flip is gone (no setLiveAnswer anywhere)",
  !fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8").includes("setLiveAnswer") &&
  !fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8").includes("setLiveAnswer") &&
  !fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8").includes("getLiveAnswer"));
check("audit: seed upserts bank.json and clears votes on answer change",
  fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8").includes("ON CONFLICT (id) DO UPDATE") &&
  fs.readFileSync(path.join(__dirname, "..", "db.js"), "utf8").includes("DELETE FROM votes WHERE question_id=$1"));
let ausInDaily = false;
for (let d = 0; d < 365; d++) {
  for (const id of composeSet(bank.questions, `daily:${addDays(today, d)}`)) {
    if (/australian/i.test(byId.get(id)?.text || "")) ausInDaily = true;
  }
}
check("Australia never appears in 365 days of daily sets", !ausInDaily);
// Fine-tune button placement — static DOM-order check (no browser in this sandbox):
// the button must sit inside the pinned .controls block directly above the slider,
// and the show/hide toggle must fire at guess <= 1% for both drag and typed input.
const appJs = fs.readFileSync(path.join(__dirname, "..", "client", "app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "client", "styles.css"), "utf8");
const btnIdx = appJs.indexOf('id="finetune-btn"');
const sliderIdx = appJs.indexOf('id="slider"', btnIdx);
const controlsIdx = appJs.indexOf('class="controls"');
check("fine-tune button sits in pinned controls directly above the slider",
  controlsIdx !== -1 && btnIdx !== -1 && sliderIdx !== -1 && controlsIdx < btnIdx && btnIdx < sliderIdx);
check("controls are sticky-pinned (CSS)", /\.controls\s*\{[^}]*position:\s*sticky/.test(css));
check("fine-tune button shows at guess <= 1% (drag or typed)", appJs.includes("!(v <= 1)"));

console.log("== unit: 2026-11-16 text reveal + tagline sync ==");
const html = fs.readFileSync(path.join(__dirname, "..", "client", "index.html"), "utf8");
const TAGLINE = "How well do you know people?";
// Text reveal: the crowd's #1 answer must not be rendered anywhere in the playing flow.
// The mode wording ("Name the crowd's #1", "the crowd's #1 scores the most") stays —
// only the actual #1 answer is gone.
check("text reveal never renders the crowd's #1 answer", !appJs.includes("r.textAnswer"));
check("text reveal has no 'The crowd's #1' answer line", !appJs.includes("The crowd's #1: <b>"));
check("text reveal still shows your own answer + rank", appJs.includes("You said:") && appJs.includes("r.textRank"));
// Tagline: exact in every spot, old tagline gone.
check("tagline: page title exact", html.includes(`<title>Usually — ${TAGLINE}</title>`));
check("tagline: header sub exact", html.includes(`<div class="sub">${TAGLINE}</div>`));
check("tagline: meta description leads with it", html.includes(`<meta name="description" content="${TAGLINE}`));
check("tagline: og title + description", html.includes(`<meta property="og:title" content="Usually — ${TAGLINE}">`) && html.includes(`<meta property="og:description" content="${TAGLINE}`));
check("tagline: twitter title + description", html.includes(`<meta name="twitter:title" content="Usually — ${TAGLINE}">`) && html.includes(`<meta name="twitter:description" content="${TAGLINE}`));
check("tagline: share card closing line", appJs.includes(`Play Usually — ${TAGLINE}`));
check("old tagline gone from client", !html.includes("what do people usually do?") && !appJs.includes("what do people usually do?"));

console.log("== unit: 2026-11-16 entry grid + warm paper ==");
// Entry grid: present on the answering screen for Guess and Split rounds,
// placed before the slider/controls so question + grid + slider + Lock fit
// one phone screen. Template order in showRound is Split branch first,
// Guess branch second.
const entryIdx = [];
let ep = -1;
while ((ep = appJs.indexOf('id="entry-grid"', ep + 1)) !== -1) entryIdx.push(ep);
check("entry grid rendered on Guess and Split answering screens", entryIdx.length === 2);
check("entry grid sits above the Split slider", entryIdx.length === 2 &&
  appJs.indexOf('id="slider"', entryIdx[0]) < appJs.indexOf('split-labels', entryIdx[0]));
check("entry grid sits above the Guess controls", entryIdx.length === 2 &&
  entryIdx[1] < appJs.indexOf('class="controls"'));
check("entry grid lights live from sync + fine-tune",
  (appJs.match(/renderEntryGrid\(\);/g) || []).length >= 2 &&
  appJs.includes('entry: "split"') && appJs.includes('entry: "guess"'));
// Warm paper + top-anchored layout, no vertical centering.
check("warm paper background set", css.includes("--bg:#f4f1ec") && css.includes("--card:#fffdf9"));
check("no pure-white background left", !css.includes("--bg:#ffffff") && !css.includes("background:#fff;"));
check("unlit dots use the measured warm grey", css.includes("--dot-unlit:#e7e1d2") && css.includes("background:var(--dot-unlit)"));
check("old unlit colors gone", !css.includes("#e3e5e8") && !css.includes("#c9bda0"));
check("main is top-anchored, not vertically centered",
  /main\s*\{[^}]*justify-content:\s*flex-start/.test(css) && !/main\s*\{[^}]*justify-content:\s*center/.test(css));
check("entry grid is the shared 188px size", /\.grid\.entry\s*\{[^}]*max-width:\s*188px/.test(css));
// 2026-11-16 entry-grid collapse (live-site bug): #entry-grid is a direct
// child of main#screen, a column FLEX container, and carries horizontal auto
// margins — so it is NOT stretched, and its width resolves to fit-content.
// With repeat(10, 1fr) columns holding only empty aspect-ratio dots, the
// intrinsic width is just the gaps (~27px), the 1fr columns and the dots
// collapse to 0px, and the grid is invisible in a real browser even though
// the DOM has all 100 children. A definite width is what keeps it at 188px.
check("entry grid has a definite width (flex-item collapse guard)",
  /\.grid\.entry\s*\{[^}]*width:\s*(100%|188px)/.test(css));
// How to Play: no scoring numbers anywhere in the overlay.
const howto = html.slice(html.indexOf('id="howto"'), html.indexOf('id="howto-close"'));
check("How to Play shows no scoring math", !/points off|=\s*\d|0[–-]20|\b\d+\s*pts\b/.test(howto));
check("How to Play keeps the no-math wording",
  howto.includes("The closer your guess, the more points. A perfect guess is a Bullseye."));

console.log("== unit: 2026-11-16 exact-spec alignment (Muse-measured values) ==");
// Theme values, copied exactly from the Muse version.
check("theme: bg/card/surface/navy/gold/poppy/dot-empty exact",
  css.includes("--bg:#f4f1ec") && css.includes("--card:#fffdf9") && css.includes("--surface:#fffdf9") &&
  css.includes("--navy:#232c42") && css.includes("--gold:#cf9a06") &&
  css.includes("--poppy:#e8442e") && css.includes("--dot-unlit:#e7e1d2"));
check("theme: old values gone",
  !css.includes("#faf5ec") && !css.includes("#fffdf7") && !css.includes("#1b2a4a") &&
  !css.includes("#d4a017") && !css.includes("#e4572e") && !css.includes("#c9bda0"));
check("theme: main column is 620px wide", /#app\s*\{[^}]*max-width:\s*620px/.test(css));
check("theme: dark-mode overrides present with exact values",
  /@media\s*\(prefers-color-scheme:\s*dark\)/.test(css) &&
  css.includes("--bg:#101623") && css.includes("--navy:#aebddb") && css.includes("--gold:#ffd60a") &&
  css.includes("--dot-empty:#2e3a52") && css.includes("--surface:#1a2233"));
// One shared grid size everywhere: answering and reveal identical.
check("grid: reveal grid is 188px / 3px gap",
  /\.grid\s*\{[^}]*max-width:\s*188px/.test(css) && /\.grid\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: entry grid is 188px / 3px gap",
  /\.grid\.entry\s*\{[^}]*max-width:\s*188px/.test(css) && /\.grid\.entry\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: fine-tune grid is 224px / 3px gap",
  /\.grid\.small\s*\{[^}]*max-width:\s*224px/.test(css) && /\.grid\.small\s*\{[^}]*gap:\s*3px/.test(css));
// Rings are INSET everywhere; no outset ring left.
check("rings are inset (box-shadow: inset 0 0 0 2px var(--gold))",
  (css.match(/box-shadow:\s*inset 0 0 0 2px var\(--gold\)/g) || []).length >= 4 &&
  !/box-shadow:\s*0 0 0 2px var\(--gold\)/.test(css));
check("guess dots fill with surface, not grey",
  /\.grid \.dot\.gold\s*\{[^}]*background:\s*var\(--surface\)/.test(css));
check("fine-tune dots are gold 28% mix over surface + inset ring",
  /\.grid \.dot\.ft\s*\{[^}]*color-mix\(in srgb,\s*var\(--gold\) 28%,\s*var\(--surface\)\)/.test(css) &&
  /\.grid \.dot\.ft\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--gold\)/.test(css));
// Legends, exact text.
check("answering legend (Guess) is exactly 'Gold ring = your guess'",
  appJs.includes("Gold ring = your guess"));
check("reveal legend (Guess) is the exact three lines",
  appJs.includes("Navy = the crowd") && appJs.includes("Gold ring = your guess") && appJs.includes("Both = you got these"));
check("old reveal legend copy gone",
  !appJs.includes("crowd ${r.answer}%") && !appJs.includes("Each dot is 0.01%"));
check("reveal legend (Split) is labels + 'Gold ring = your split'",
  appJs.includes("Gold ring = your split"));
check("reveal split passes the player's split to the grid",
  appJs.includes("playerSplit: r.guess"));
check("fine-tune grid uses the fine-tune spec",
  appJs.includes('entry: "fine"'));

// renderGrid logic, run against a minimal DOM stub (no browser in this sandbox).
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
const gridSrc = extractFn(appJs, "renderGrid");
check("renderGrid source extractable for logic test", !!gridSrc);
if (gridSrc) {
  const makeEl = () => {
    const added = [];
    return {
      className: "",
      children: [],
      classList: { add: (...c) => added.push(...c) },
      appendChild(ch) { this.children.push(ch); },
      _added: added,
    };
  };
  const renderGrid = new Function("document", `${gridSrc}; return renderGrid;`)({ createElement: () => makeEl() });
  const runGrid = (spec) => {
    const c = makeEl();
    renderGrid(c, spec);
    return c.children;
  };
  const has = (dots, i, ...names) => names.every((n) => dots[i]._added.includes(n));
  const noneHas = (dots, ...names) => dots.every((d) => !names.some((n) => d._added.includes(n)));

  let dots = runGrid({ entry: "guess", value: 50 });
  check("entry guess 50: gold rings on first 50 dots, no crowd colors",
    dots.length === 100 && dots.slice(0, 50).every((d) => d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0) && noneHas(dots, "navy", "poppy"));
  dots = runGrid({ entry: "guess", value: 0 });
  check("entry guess 0: no dots lit", dots.every((d) => d._added.length === 0));
  dots = runGrid({ entry: "guess", value: 37 });
  check("entry hundredths 37: gold rings on first 37 dots only",
    dots.slice(0, 37).every((d) => d._added.includes("gold")) && dots.slice(37).every((d) => d._added.length === 0));
  dots = runGrid({ entry: "fine", value: 37 });
  check("fine-tune 37: gold-mix dots on first 37 only",
    dots.slice(0, 37).every((d) => d._added.includes("ft")) && dots.slice(37).every((d) => d._added.length === 0) && noneHas(dots, "gold", "navy", "poppy"));
  dots = runGrid({ entry: "split", left: 35 });
  check("entry split 35/65: navy left, poppy right, NO gold ring while answering",
    dots.slice(0, 35).every((d) => d._added.includes("navy")) &&
    dots.slice(35).every((d) => d._added.includes("poppy")) && noneHas(dots, "gold"));
  dots = runGrid({ crowd: 29, guess: 50 });
  check("reveal guess 50 vs crowd 29: overlap navy+gold 0-28, guess-only gold 29-49, rest unlit",
    dots.slice(0, 29).every((d) => d._added.includes("navy") && d._added.includes("gold")) &&
    dots.slice(29, 50).every((d) => d._added.includes("gold") && !d._added.includes("navy")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ crowd: 50, guess: 50 });
  check("reveal exact match: every filled dot is navy + gold",
    dots.slice(0, 50).every((d) => d._added.includes("navy") && d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ crowd: 50, guess: 20 });
  check("reveal guess below crowd: overlap 0-19 navy+gold, crowd-only 20-49 navy, rest unlit",
    dots.slice(0, 20).every((d) => d._added.includes("navy") && d._added.includes("gold")) &&
    dots.slice(20, 50).every((d) => d._added.includes("navy") && !d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ split: { left: 65, right: 35 }, playerSplit: 35 });
  check("reveal split: crowd halves navy/poppy, gold ring on dots up to player's split only",
    dots.slice(0, 65).every((d) => d._added.includes("navy")) &&
    dots.slice(65).every((d) => d._added.includes("poppy")) &&
    dots.slice(0, 35).every((d) => d._added.includes("gold")) &&
    dots.slice(35).every((d) => !d._added.includes("gold")));
}

// ------------------------------------------------------- integration: HTTP
console.log("== integration: server ==");
try { fs.unlinkSync(TMP); } catch {}
const child = spawn("node", ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(PORT), LOCAL_DATA_PATH: TMP },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(p, opts) {
  const r = await fetch(BASE + p, { headers: { "Content-Type": "application/json" }, ...(opts || {}) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j, raw: JSON.stringify(j) };
}
let healthOk = false;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try { const r = await fetch(BASE + "/health"); if (r.ok) { healthOk = true; break; } } catch {}
}
check("server boots and /health is ok", healthOk);
if (!healthOk) { child.kill(); process.exit(1); }

const h = await api("/health");
check("health reports bankQuestions 142", h.body.bankQuestions === 142, JSON.stringify(h.body));

const t1 = await api("/api/today");
const t2 = await api("/api/today");
check("today returns 7 questions", t1.body.questions?.length === 7);
check("today is frozen (two calls identical)", JSON.stringify(t1.body.questions) === JSON.stringify(t2.body.questions));
check("today has no answers leaked", !t1.raw.includes('"answer":') && !t1.raw.includes("textAnswer"));

const home = await fetch(BASE + "/");
const homeText = await home.text();
check("served index.html carries new tagline, old tagline gone",
  homeText.includes("How well do you know people?") && !homeText.includes("what do people usually do?"));

const servedCss = await (await fetch(BASE + "/styles.css")).text();
check("served styles.css has exact theme + shared 188px grid + inset rings + dark mode",
  servedCss.includes("--bg:#f4f1ec") && servedCss.includes("--navy:#232c42") &&
  servedCss.includes("--gold:#cf9a06") && servedCss.includes("--dot-unlit:#e7e1d2") &&
  servedCss.includes("max-width:188px") && servedCss.includes("box-shadow:inset 0 0 0 2px var(--gold)") &&
  servedCss.includes("@media (prefers-color-scheme: dark)") && servedCss.includes("--bg:#101623"));
check("served styles.css has top-anchored main, no vertical centering",
  /main\s*\{[^}]*justify-content:\s*flex-start/.test(servedCss) && !/main\s*\{[^}]*justify-content:\s*center/.test(servedCss));
const servedJs = await (await fetch(BASE + "/app.js")).text();
check("served app.js renders entry grid on Guess/Split answering screens",
  (servedJs.match(/id="entry-grid"/g) || []).length === 2);
check("served app.js entry grid uses gold-only modes, no crowd data",
  servedJs.includes('entry: "guess"') && servedJs.includes('entry: "split"'));
check("served app.js has exact legends + playerSplit reveal + fine-tune spec",
  servedJs.includes("Gold ring = your guess") && servedJs.includes("Navy = the crowd") &&
  servedJs.includes("Both = you got these") && servedJs.includes("Gold ring = your split") &&
  servedJs.includes("playerSplit: r.guess") && servedJs.includes('entry: "fine"'));
const servedHowto = homeText.slice(homeText.indexOf('id="howto"'), homeText.indexOf('id="howto-close"'));
check("served How to Play shows no scoring math", !/points off|=\s*\d|0[–-]20|\b\d+\s*pts\b/.test(servedHowto));

const pid = "verify-player-001";
// Contribute locked before playing
const locked = await api(`/api/contribute?playerId=${pid}`);
check("contribute locked before daily", locked.body.unlocked === false && locked.body.questions.length === 0);
check("contribute lock reason present", typeof locked.body.reason === "string" && locked.body.reason.length > 10);

// Full daily, perfect answers -> 1225
const play1 = await api("/api/play", { method: "POST", body: JSON.stringify({ playerId: pid, mode: "daily" }) });
const play2 = await api("/api/play", { method: "POST", body: JSON.stringify({ playerId: pid, mode: "daily" }) });
check("one run per day: second startPlay resumes same play", play1.body.playId === play2.body.playId);
const play = play1.body;
let perfect = true;
for (let i = 0; i < 7; i++) {
  const q = play.questions[i];
  const full = byId.get(q.id);
  const body = q.kind === "text"
    ? { answer: full.top1 }
    : { guess: full.answer };
  const s = await api(`/api/play/${play.playId}/submit`, {
    method: "POST", body: JSON.stringify({ playerId: pid, roundIndex: i, ...body }),
  });
  if (q.kind === "text") check("text submit response carries no #1 answer",
    !("textAnswer" in (s.body.result || {})) && !JSON.stringify(s.body).includes("top1"));
  if (s.body.result?.points !== 175 || s.body.result?.tier !== "Bullseye") perfect = false;
  if (i === 6) check("daily completes after round 7", s.body.completed === true);
}
check("perfect daily scores 1225", perfect);
const res = await api(`/api/results?playerId=${pid}&date=${today}`);
check("results endpoint returns completed daily, score 1225", res.body.completed === true && res.body.score === 1225);
check("results endpoint stores no #1 answer", !res.raw.includes("textAnswer") && !res.raw.includes("top1"));

const st = await api(`/api/stats?playerId=${pid}`);
check("stats: 1 game, 1 day, streak 1, best 1225", st.body.gamesPlayed === 1 && st.body.daysPlayed === 1 && st.body.streak === 1 && st.body.bestScore === 1225, JSON.stringify(st.body));

const share = await api(`/api/share?playerId=${pid}&date=${today}`);
check("share card has 7 emojis + score", (share.body.text.match(/\u{1F3AF}/gu) || []).length === 7 && share.body.text.includes("1225"), share.body.text || "");

// Contribute unlocked after daily
const unlocked = await api(`/api/contribute?playerId=${pid}`);
check("contribute unlocked after daily", unlocked.body.unlocked === true);
check("contribute serves 6 questions with vote prompts", unlocked.body.questions?.length === 6 && unlocked.body.questions.every((q) => q.votePrompt));
check("contribute response leaks no answers/percentages", !unlocked.raw.includes('"answer"') && !/:\s*\d+\s*%/.test(unlocked.raw));
const servedIds = new Set(unlocked.body.questions.map((q) => q.id));
const embargo = new Set();
for (let d = 0; d <= 7; d++) for (const id of composeSet(bank.questions, `daily:${addDays(today, d)}`)) embargo.add(id);
check("contribute never serves a question in today..+7 daily sets", [...servedIds].every((id) => !embargo.has(id)));
const firstQ = unlocked.body.questions[0];
const vote1 = await api("/api/contribute/vote", { method: "POST", body: JSON.stringify({ playerId: pid, questionId: firstQ.id, vote: firstQ.kind === "split" ? "left" : "yes" }) });
check("vote accepted, returns only ok", vote1.body.ok === true && Object.keys(vote1.body).length === 1, JSON.stringify(vote1.body));
const vote2 = await api("/api/contribute/vote", { method: "POST", body: JSON.stringify({ playerId: pid, questionId: firstQ.id, vote: firstQ.kind === "split" ? "left" : "yes" }) });
check("second vote on same question rejected", vote2.body.ok === false);
const voteBad = await api("/api/contribute/vote", { method: "POST", body: JSON.stringify({ playerId: pid, questionId: 59, vote: "yes" }) });
check("population stat (id 59) is not votable", voteBad.body.ok === false);
const unlocked2 = await api(`/api/contribute?playerId=${pid}`);
check("voted question disappears from the list", !unlocked2.body.questions.some((q) => q.id === firstQ.id));

// Endless: hundredths round end-to-end (find a sub-1% finale within a few plays)
let hundredthsOk = false;
for (let attempt = 0; attempt < 12 && !hundredthsOk; attempt++) {
  const ep = await api("/api/play", { method: "POST", body: JSON.stringify({ playerId: `verify-endless-${attempt}`, mode: "endless" }) });
  const finale = byId.get(ep.body.questions[6].id);
  if (!finale || finale.answer >= 1) continue;
  for (let i = 0; i < 6; i++) {
    const q = ep.body.questions[i];
    const full = byId.get(q.id);
    await api(`/api/play/${ep.body.playId}/submit`, {
      method: "POST",
      body: JSON.stringify({ playerId: `verify-endless-${attempt}`, roundIndex: i, ...(q.kind === "text" ? { answer: full.top1 } : { guess: full.answer }) }),
    });
  }
  const offByOneHundredth = Math.round((finale.answer + 0.01) * 100) / 100;
  const s = await api(`/api/play/${ep.body.playId}/submit`, {
    method: "POST", body: JSON.stringify({ playerId: `verify-endless-${attempt}`, roundIndex: 6, guess: offByOneHundredth }),
  });
  hundredthsOk = s.body.result?.points === 100 && s.body.result?.tier === "Dead On";
}
check("hundredths scoring end-to-end (0.01 off = 100)", hundredthsOk);

// Autocorrect end-to-end: a text answer with filler words ("my " + top1)
// must still match rank 1 through the real server.
let nearMissOk = false;
{
  const ep = await api("/api/play", { method: "POST", body: JSON.stringify({ playerId: "verify-nearmiss", mode: "endless" }) });
  let sawText = false, allBullseye = true;
  for (let i = 0; i < 7; i++) {
    const q = ep.body.questions[i];
    const full = byId.get(q.id);
    // Whole numbers only at >=1% (e.g. finale 2.6 scores 175 via a 3 guess).
    const body = q.kind === "text"
      ? { answer: `my ${full.top1}` }
      : { guess: full.answer >= 1 ? Math.round(full.answer) : full.answer };
    if (q.kind === "text") sawText = true;
    const s = await api(`/api/play/${ep.body.playId}/submit`, {
      method: "POST", body: JSON.stringify({ playerId: "verify-nearmiss", roundIndex: i, ...body }),
    });
    if (s.body.result?.points !== 175) allBullseye = false;
  }
  nearMissOk = sawText && allBullseye;
}
check('near-miss text answers ("my " + #1) score Bullseye end-to-end', nearMissOk);

// Yesterday peek
const y = await api("/api/yesterday");
check("yesterday returns 7 rounds with answers", y.body.rounds?.length === 7 && y.body.rounds.every((r) => r.answer !== undefined && r.answer !== null));
check("yesterday peek still shows the text #1 (out of scope, unchanged)",
  y.body.rounds.filter((r) => typeof r.answer === "string").length === 2);

console.log("== integration: real DOM (jsdom) — entry grid actually renders ==");
// 2026-11-16 entry-grid collapse (live-site bug): the DOM was always correct
// (100 children, right classes) — the grid collapsed to ~0px in a real browser
// because #entry-grid is a flex item of main#screen with auto margins and no
// definite width. A stub test cannot catch that, so this section loads the
// real served page in jsdom and drives a full Endless play in the real DOM:
// the entry grid must have 100 children with the right classes after render
// AND after a slider input, on every Guess and Split round.
const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => jsdomErrors.push(String(e.message || e)));
vc.on("error", (...a) => jsdomErrors.push(a.join(" ")));
const domHtml = await (await fetch(BASE + "/")).text();
const dom = new JSDOM(domHtml, {
  url: BASE + "/",
  runScripts: "dangerously",
  resources: "usable",
  virtualConsole: vc,
  pretendToBeVisual: true,
  beforeParse(window) {
    // Node's fetch needs absolute URLs; resolve relative API paths against the page.
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? new URL(input, window.location.href).href : input;
      return globalThis.fetch(url, init);
    };
    if (!window.crypto?.randomUUID) window.crypto = globalThis.crypto;
  },
});
const domDoc = dom.window.document;
const waitForDom = async (fn, label, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = fn(); if (v) return v; await sleep(100); }
  throw new Error(`timeout waiting for: ${label}`);
};
const gridCounts = (el) => {
  if (!el) return null;
  const kids = [...el.children];
  const has = (name) => kids.filter((k) => k.classList.contains(name)).length;
  return { n: kids.length, gold: has("gold"), navy: has("navy"), poppy: has("poppy"), ft: has("ft") };
};
await waitForDom(() => domDoc.querySelector("#btn-endless"), "home Endless button");
domDoc.querySelector("#btn-endless").click();
let domEntryOk = true, domRevealOk = true;
for (let round = 1; round <= 7; round++) {
  await waitForDom(() => domDoc.querySelector("#slider") || domDoc.querySelector("#text-answer"), `round ${round} controls`);
  await sleep(200);
  const isText = !!domDoc.querySelector("#text-answer");
  if (!isText) {
    const isSplit = !!domDoc.querySelector(".split-labels");
    const entry = gridCounts(domDoc.querySelector("#entry-grid"));
    if (isSplit) {
      if (!(entry && entry.n === 100 && entry.navy === 50 && entry.poppy === 50 && entry.gold === 0)) domEntryOk = false;
    } else {
      if (!(entry && entry.n === 100 && entry.gold === 50 && entry.navy === 0)) domEntryOk = false;
    }
    // Slider input must re-light the grid live (the exact gesture the bug hid).
    const s = domDoc.querySelector("#slider");
    s.value = isSplit ? "96" : "70";
    s.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await sleep(200);
    const after = gridCounts(domDoc.querySelector("#entry-grid"));
    if (isSplit) {
      if (!(after && after.n === 100 && after.navy === 96 && after.poppy === 4 && after.gold === 0)) domEntryOk = false;
    } else {
      if (!(after && after.n === 100 && after.gold === 70 && after.navy === 0)) domEntryOk = false;
    }
  } else {
    domDoc.querySelector("#text-answer").value = "verify answer";
  }
  domDoc.querySelector("#submit").click();
  await waitForDom(() => domDoc.querySelector("#next") || domDoc.querySelector(".score-big"), `round ${round} reveal/results`);
  await sleep(200);
  const reveal = domDoc.querySelector("#grid");
  if (reveal) {
    const rc = gridCounts(reveal);
    if (!(rc && rc.n === 100)) domRevealOk = false;
  }
  const next = domDoc.querySelector("#next");
  if (next) next.click();
}
await waitForDom(() => domDoc.querySelector(".score-big"), "results screen");
check("real DOM: entry grid has 100 children, right classes, on every Guess/Split round (render + slider input)", domEntryOk);
check("real DOM: reveal grid has 100 children after every submit", domRevealOk);
check("real DOM: no JS errors during the full Endless play", jsdomErrors.length === 0, jsdomErrors.join(" | "));
dom.window.close();

// ------------------------------------------------- integration: seed upsert (pg-mem)
// The seed must upsert bank.json over an existing Postgres DB (the live Render
// path): answers update, votes for changed answers clear, votes for unchanged
// answers survive, removed questions + their votes/stats are deleted.
console.log("== integration: seed upsert (pg-mem) ==");
const seedTest = await new Promise((resolve) => {
  const p = spawn("node", ["--loader", "./scripts/pg-mem-loader.mjs", "scripts/test-seed-upsert.mjs"], {
    cwd: path.resolve(__dirname, ".."), stdio: "pipe",
  });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  p.on("close", (code) => resolve({ code, out }));
});
check("seed upsert: old answers update, changed votes clear, unchanged kept, removed deleted (pg-mem)",
  seedTest.code === 0, seedTest.out.split("\n").filter((l) => l.startsWith("FAIL")).join(" | "));

child.kill();
try { fs.unlinkSync(TMP); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
