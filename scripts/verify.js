// End-to-end verification for Honeydle. Spawns the real server against a throwaway
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
const TMP = "/tmp/crowdle-verify-local.json";
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
check("1 off = 100 One Off", scoreGuess(57, 58).points === 100 && scoreGuess(57, 58).tier === "One Off");
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
const q204 = byId.get(204);
check("exact match caspian sea rank 1", matchTextAnswer(q204, "Caspian Sea").rank === 1);
check("case-insensitive", matchTextAnswer(q204, "CASPIAN SEA").rank === 1);
check("typo forgiven (caspain sea)", matchTextAnswer(q204, "caspain sea").rank === 1);
check("plural forgiven", matchTextAnswer(byId.get(189), "british empires").rank === 1);
check("unlisted stays unlisted", matchTextAnswer(q204, "my horoscope told me not to go").rank === null);
check("alias: lake superior = rank 2", matchTextAnswer(q204, "lake superior").rank === 2);
check("normalize strips articles", normalizeText("A phone screen") === "phone screen");
// 2026-11-17 autocorrect matching: synonyms, word order, filler words,
// abbreviations, typos (Damerau transpositions) — with guards so distinct
// answers in the same list are never conflated. [qid, submitted, wantRank]
const MATCH_CASES = [
  // Kept prompts (unchanged from the pre-overhaul bank).
  [108, "being lost", 85], [108, "being lose", 85], [108, "getting lost", 85],
  [108, "dove", null], [110, "dove", null], [110, "tired", null],
  [110, "flying", 3], [110, "being able to fly", 3], [110, "fly", 3],
  [110, "flight", 3], [110, "flew", 3], [110, "flown", 3],
  [110, "time travelling", 4], [110, "traveling in time", 4],
  [110, "living forever", 8], [110, "never dying", 8],
  [110, "live forever", 8], [110, "never die", 8],
  [110, "controlling wind", 39], [110, "control wind", 39],
  [110, "manipulating time", 9], [110, "manipulate time", 9],
  [111, "baby sitting", 2], [111, "baby sat", 2],
  [111, "fast food", 1],
  [124, "debate", 54], [124, "debating", 54],
  [124, "math", 1],
  [177, "hot dog", null], [177, "dog", 1],
  [179, "frenchie", 1], [179, "french bulldog", 1],
  [180, "light blue", 31], [180, "blue", 1],
  [108, "snakes", 1], [108, "snake", 1],
  [109, "ford mustang", 1], [109, "mustang", 1],
  // 2026-11-17 overhaul: top-1 exact for every new text prompt.
  [189, "british empire", 1], [190, "sobhuza ii", 1], [191, "world war ii", 1],
  [192, "university of bologna", 1], [201, "peregrine falcon", 1], [202, "blue whale", 1],
  [203, "ocean quahog clam", 1], [204, "caspian sea", 1], [210, "india", 1],
  [211, "russia", 1], [212, "nile", 1], [213, "france", 1], [224, "google", 1],
  [225, "chatgpt", 1], [226, "nvidia", 1], [235, "english", 1],
  [236, "avengers: endgame", 1], [237, "united states", 1], [238, "smith", 1],
  [245, "home health and personal care aides", 1], [246, "united states", 1],
  [247, "sugar cane", 1], [249, "business", 1], [256, "lung cancer", 1],
  [257, "atorvastatin", 1], [258, "ischaemic heart disease", 1], [259, "breast cancer", 1],
  // Mechanics on new lists: typo / plural / alias / case.
  [204, "CASPIAN SEA", 1], [204, "caspain sea", 1], [204, "lake superior", 2],
  [189, "british empires", 1], [202, "blue whales", 1], [224, "google.com", 1],
  [237, "usa", 1], [237, "us", 1], [210, "taiwan", 57], [224, "openai", 80],
  [236, "avengers endgame", 1], [247, "sugar can", 1], [257, "atorvastatine", 1],
  [201, "peregrine falcom", 1],
  // Decollide guards: ambiguous bare words match nothing — the matcher must
  // refuse to guess on a tie. ("lion king" is the one exception: it resolves
  // to the 1994 original, rank 14, since the 2019 remake is only matchable
  // with its year attached.)
  [189, "france", null], [189, "jin dynasty", null], [190, "george william", null],
  [190, "frederick v", null], [201, "swift", null], [202, "elephant", null],
  [202, "rhinoceros", null], [202, "right whale", null], [203, "deer", null],
  [224, "pornhub", null], [224, "xhamster", null], [235, "punjabi", null],
  [236, "lion king", 14], [204, "dead sea", null],
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
check("vote prompt derived for guess", deriveVotePrompt(byId.get(11)).length > 3);
check("vote prompt for split", deriveVotePrompt(byId.get(45)) === "Pick your side");
// 2026-11-17 Contribute fix: 22 votable guess questions fell through to the
// meaningless "Is this you?" fallback. Nine now derive via new transforms
// (think their / think / believe / pick / say they are / say they, plus
// Facebook users / Brits / NBA fans in the population strip), twelve carry
// an explicit votePrompt, and id 56 (osteoporosis breakage) is non-votable
// like id 59 (third nipple) — a population stat, not a self-voteable
// behavior. The same pass fixed 11 older derived prompts that were
// themselves wrong (third-person pronouns and "Have you a ..." grammar).
// 2026-11-17 overhaul: most of those questions are gone (killed ids
// removed from VOTE_PROMPT_EXPECTED below). The six that survive keep their
// pinned prompts. The old pronoun-rule exceptions (ids 5 and 152) are gone
// with their questions — no exemptions remain: every derived prompt must
// be first-person.
const VOTE_PROMPT_EXPECTED = {
  24: "Would you give up Facebook for a month for $500?",
  32: "Could you qualify for the 2028 Olympics if you started training today?",
  145: "Are you afraid of public speaking?",
  155: "Do you believe some UFOs have been alien spacecraft?",
  167: "Do you think your three-point shot is better than or the same as an average pro's?",
  168: "Could you score 3 or more buckets in a pick-up game against an average pro?",
};
const promptBad = [];
for (const q of bank.questions.filter((q) => q.votable)) {
  const p = deriveVotePrompt(q);
  if (q.kind === "split") { if (p !== "Pick your side") promptBad.push(`${q.id}: split prompt is ${p}`); continue; }
  if (p === "Is this you?") promptBad.push(`${q.id}: fallback`);
  else if (!p.endsWith("?")) promptBad.push(`${q.id}: not a question (${p})`);
  else if (p.includes("%")) promptBad.push(`${q.id}: percentage in prompt (${p})`);
  else if (/^Have you (a|an) /i.test(p)) promptBad.push(`${q.id}: ungrammatical (${p})`);
  else if (/\bthey\b|\btheir\b|\bthem\b|\bthemselves\b/i.test(p)) promptBad.push(`${q.id}: third-person pronoun (${p})`);
  if (VOTE_PROMPT_EXPECTED[q.id] && p !== VOTE_PROMPT_EXPECTED[q.id]) promptBad.push(`${q.id}: expected ${VOTE_PROMPT_EXPECTED[q.id]}, got ${p}`);
}
check("vote prompts: no votable question falls back to 'Is this you?', every guess prompt is a real first-person question", promptBad.length === 0, promptBad.join(" | "));
check("population stat id 56 (osteoporosis) is not votable", byId.get(56)?.votable === false);

console.log("== unit: 2026-11-16 sync fixes ==");
check("Australia finale retired from bank", !bank.questions.some((q) => /australian/i.test(q.text)));
check("half-court reframed to NBA fans, answer 41 (2026-11-16 audit)",
  byId.get(142)?.text === "What % of NBA fans think they could sink a half-court shot?" && byId.get(142)?.answer === 41);
check("half-court vote prompt matches reframed text",
  byId.get(142)?.votePrompt === "Could you sink a half-court shot?");
check("bank is 142 questions (72 guess, 25 split, 10 finale, 35 text) after 2026-11-17 overhaul",
  bank.questions.length === 142 &&
  bank.questions.filter((q) => q.kind === "guess" && !q.finale).length === 72 &&
  bank.questions.filter((q) => q.kind === "split").length === 25 &&
  bank.questions.filter((q) => q.finale).length === 10 &&
  bank.questions.filter((q) => q.kind === "text").length === 35);
// 2026-11-16 research audit — researched answers are authoritative, never voted:
check("audit: every guess/split answer is representable (0.01–100) and whole at >= 1% (the game rejects decimal guesses at 1%+, so the stored answer must be a whole number a player can type)",
  bank.questions.filter((q) => q.kind !== "text").every((q) => q.answer != null && q.answer >= 0.01 && q.answer <= 100 && (q.answer < 1 || Number.isInteger(q.answer))));
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
// 2026-11-17 fix-everything pass: the reordered top 10s (researched sources) and
// the sense-sweep merges are pinned here so a future bank edit can't silently
// revert them. Q110 healing #1 (PixlParade 2026 + Morning Consult); Q179 2025
// AKC; Q177 APPA 2026 State of the Industry; Q108 US YouGov (Snakes #1);
// Q109 MoneySuperMarket (Charger #3, Bronco #5, Cayenne #8).
// 2026-11-17 overhaul: the killed questions are pinned GONE (79 ids), plus
// the overhaul's judgment calls — websites list cleaned of adult/gambling
// sites, empires decollide, films top1 per The Numbers (Box Office Mojo has
// Avatar #1 — conflict documented in VERIFICATION.md), stock ownership
// updated to Gallup April 2026 (58%), Taiwan in the populous list.
const topHeads = (id, n) => byId.get(id).textAnswers.slice(0, n).map((a) => a.texts[0]);
check("reorder Q110: healing #1",
  byId.get(110).top1 === "Healing others" &&
  JSON.stringify(topHeads(110, 5)) === JSON.stringify(["Healing others", "Teleportation", "Flying", "Time travel", "Invisibility"]));
check("reorder Q179: 2025 AKC order",
  JSON.stringify(topHeads(179, 10)) === JSON.stringify(["French Bulldog", "Labrador Retriever", "Golden Retriever", "German Shepherd", "Dachshund", "Poodle", "Beagle", "Rottweiler", "German Shorthaired Pointer", "Bulldog"]));
check("reorder Q177: reptile #4 ahead of small mammal and bird",
  JSON.stringify(topHeads(177, 6)) === JSON.stringify(["Dog", "Cat", "Fish", "Reptile", "Small mammal", "Bird"]));
check("reorder Q108: snakes #1, public speaking #3",
  byId.get(108).top1 === "Snakes" && topHeads(108, 3)[2] === "Public speaking");
check("reorder Q109: charger #3, bronco #5, cayenne #8",
  JSON.stringify(topHeads(109, 8)) === JSON.stringify(["Ford Mustang", "Porsche 911", "Dodge Charger", "Tesla Model 3", "Ford Bronco", "Tesla Model Y", "BMW M3", "Porsche Cayenne"]));
check("sense Q111: babysitting merged, busboy is its own rank",
  byId.get(111).textAnswers.find((a) => a.texts[0] === "Busboy")?.rank === 80 &&
  byId.get(111).textAnswers.find((a) => a.rank === 2).texts.includes("Babysitting for family"));
const KILLED_IDS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 17, 18, 19, 22, 25, 28, 29, 30, 31, 33, 34, 35, 44, 46, 51, 52, 54, 60, 62, 66, 67, 68, 69, 76, 77, 82, 83, 84, 85, 86, 87, 103, 104, 105, 106, 107, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 125, 126, 127, 128, 129, 130, 131, 132, 144, 148, 149, 150, 151, 152, 153, 154, 175, 176, 178];
check("overhaul: all 79 killed question ids are gone from the bank",
  KILLED_IDS.every((id) => !byId.has(id)));
check("overhaul: websites list has no adult or gambling site",
  !byId.get(224).textAnswers.some((a) => /pornhub|xhamster|xvideos|stripchat|xnxx|eporner|chaturbate|\bbet\b/i.test(a.texts[0])) &&
  byId.get(224).top1 === "Google" &&
  byId.get(224).textAnswers.find((a) => a.texts[0] === "OpenAI")?.rank === 80);
check("overhaul: empires list has no bare 'France' variant",
  !byId.get(189).textAnswers.some((a) => a.texts.some((t) => t.toLowerCase().trim() === "france")));
check("overhaul: films top1 is Endgame per The Numbers",
  byId.get(236).top1 === "Avengers: Endgame");
check("overhaul: stock ownership is Gallup April 2026 (58%)",
  byId.get(248)?.answer === 58 && /April 2026/.test(byId.get(248)?.source || ""));
check("overhaul: Taiwan sits in the populous list",
  byId.get(210).textAnswers.find((a) => a.texts[0] === "Taiwan")?.rank === 57);
check("overhaul: bank carries no old brand names",
  !/crowdle/i.test(JSON.stringify(bank)) && !/usually/i.test(JSON.stringify(bank)));
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
const TAGLINE = "How well do you know the world?";
// Text reveal: the #1 answer must not be rendered anywhere in the playing flow.
// The mode wording ("Name the #1", "the #1 scores the most") stays —
// only the actual #1 answer is gone.
check("text reveal never renders the #1 answer", !appJs.includes("r.textAnswer"));
check("text reveal has no '#1 answer' line", !appJs.includes("The crowd's #1: <b>"));
check("text reveal still shows your own answer + rank", appJs.includes("You said:") && appJs.includes("r.textRank"));
// Tagline: exact in every spot, old tagline gone.
check("tagline: page title exact", html.includes(`<title>Honeydle — ${TAGLINE}</title>`));
check("tagline: header sub exact", html.includes(`<div class="sub">${TAGLINE}</div>`));
check("tagline: meta description leads with it", html.includes(`<meta name="description" content="${TAGLINE}`));
check("tagline: og title + description", html.includes(`<meta property="og:title" content="Honeydle — ${TAGLINE}">`) && html.includes(`<meta property="og:description" content="${TAGLINE}`));
check("tagline: twitter title + description", html.includes(`<meta name="twitter:title" content="Honeydle — ${TAGLINE}">`) && html.includes(`<meta name="twitter:description" content="${TAGLINE}`));
check("tagline: share card closing line", appJs.includes(`Play Honeydle — ${TAGLINE}`));
check("old tagline gone from client", !html.includes("what do people usually do?") && !appJs.includes("what do people usually do?") && !html.includes("How well do you know people?") && !appJs.includes("How well do you know people?"));

// Rebrand (2026-11-18): public brand is Honeydle, site playhoneydle.com.
// Wordmark, fonts, and no trace of the old names in client-facing strings.
// (Crowdle was the 2026-11-17 brand; Usually the 2026-11-16 one.)
check("brand: header wordmark reads HONEYDLE (tight spans on Y and L only)",
  html.includes('<div class="brand">HONE<span class="tight">Y</span>D<span class="tight">L</span>E</div>'));
// Title tracking (2026-11-18, measured from the Press Start 2P font file):
// Y and L carry a 125-unit left side bearing (the other letters carry 0),
// so E->Y and D->L read as double-wide gaps, and the "." glyph is a
// 250-unit square in a 1000-unit cell, so E->. reads as a triple-wide gap.
// At 26px the ink gaps were [3,3,3,6,3,6,3,9]px. The .tight spans pull Y
// and L left 0.125em and the ::after dot pulls left 0.25em, evening every
// gap to 3px. Verified by rendering the wordmark with PIL (see
// VERIFICATION.md), not by eyeballing CSS — these checks pin the markup
// and the em values that produced the even render.
check("brand: tracking — Y and L carry the -0.125em pull",
  /\.brand \.tight\s*\{[^}]*margin-left:\s*-0\.125em/.test(css));
check("brand: tracking — gold full-stop ::after pulls left -0.25em",
  /\.brand::after\s*\{[^}]*content:\s*"\."[^}]*margin-left:\s*-0\.25em/.test(css) ||
  /\.brand::after\s*\{[^}]*margin-left:\s*-0\.25em[^}]*content:\s*"\."/.test(css));
check("brand: cache-bust bumped to honeydle5", html.includes("styles.css?v=honeydle5") && html.includes("app.js?v=honeydle5"));
const serverJs = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
check("brand: no 'Crowdle' left in client-facing strings",
  !html.includes("Crowdle") && !appJs.includes("Crowdle") && !serverJs.includes("Crowdle"));
check("brand: Google Fonts pairing loaded (Press Start 2P + Libre Franklin)",
  html.includes("fonts.googleapis.com/css2?family=Press+Start+2P") && html.includes("Libre+Franklin"));
check("brand: no AI-default fonts in the stack (no Inter/Poppins/Roboto)",
  !css.includes("Inter") && !css.includes("Poppins") && !css.includes("Roboto"));
check("brand: no Fraunces left (editorial serif is out)",
  !css.includes("Fraunces") && !html.includes("Fraunces"));
check("brand: pixel font on wordmark + headings, grotesque on body",
  css.includes("--font-display") && css.includes("--font-body") &&
  /--font-display:\s*"Press Start 2P"/.test(css) &&
  /\.brand\{[^}]*font-family:\s*var\(--font-display\)/.test(css) &&
  /html,body\{[^}]*font-family:\s*var\(--font-body\)/.test(css));
check("brand: no 'Usually' left in client-facing strings",
  !html.includes("Usually") && !appJs.includes("Usually"));
check("brand: server share card leads with Honeydle", serverJs.includes("Honeydle ${play.playDate}"));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "client", "manifest.json"), "utf8"));
check("brand: manifest name + short_name are Honeydle", manifest.name === "Honeydle" && manifest.short_name === "Honeydle");

// Bee mascot (2026-11-18): seven pixel-art states in client/assets, wired by
// points in showReveal (175 gold, 100 head-to-toe honey, 90 one drop, else
// thirsty). A second consecutive Bullseye in the same play turns the bee
// diamond (bee-diamond.png). The home screen shows the whole crew in one
// parade row (bee-crew) incl. the diamond one. A run finishing at 900+
// total points shows a ruby bee on the results screen (bee-ruby.png).
// Dots stay circles — no honeycomb.
const BEE_FILES = ["bee-normal.png", "bee-golden.png", "bee-little-honey.png", "bee-drop.png", "bee-thirsty.png", "bee-diamond.png", "bee-ruby.png"];
const beeBufs = BEE_FILES.map((f) => { try { return fs.readFileSync(path.join(__dirname, "..", "client", "assets", f)); } catch { return null; } });
check("bee: all seven state PNGs exist in client/assets", beeBufs.every(Boolean));
check("bee: all seven are real PNGs (magic bytes)", beeBufs.every((b) => b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47));
check("bee: home screen shows the idle bee", appJs.includes('src="assets/bee-normal.png"'));
check("bee: home entry scene shows the whole crew incl. diamond AND ruby, one scene not two",
  (() => { const h = extractFn(appJs, "showHome"); return !!h && h.includes("bee-crew") &&
    ["bee-normal.png", "bee-thirsty.png", "bee-drop.png", "bee-little-honey.png", "bee-golden.png", "bee-diamond.png", "bee-ruby.png"].every((f) => h.includes(f)) &&
    !h.includes("bee-home"); })());
// Parade order (2026-11-18): normal first as the starting/host bee, then
// the score states worst to best — thirsty, drop, honey-coated, golden,
// diamond, ruby last as the ultimate prize. All seven in one row at 32px
// (diamond 36px) + 6px gaps = 264px, inside the 284px content width of a
// 320px phone. Flagged for Luke's veto: the normal bee leads the parade.
check("bee: parade runs normal first, then worst-to-best (thirsty, drop, honey, golden, diamond, ruby)",
  (() => { const h = extractFn(appJs, "showHome"); if (!h) return false;
    const order = ["bee-normal.png", "bee-thirsty.png", "bee-drop.png", "bee-little-honey.png", "bee-golden.png", "bee-diamond.png", "bee-ruby.png"];
    const idx = order.map((f) => h.indexOf(f));
    return idx.every((i) => i !== -1) && idx.every((v, i, a) => i === 0 || v > a[i - 1]); })());
check("bee: parade fits one row on a 320px phone (7 bees at 32px, diamond 36px, 6px gaps = 264px <= 284px)",
  /\.bee-crew \.crew-bee img\s*\{[^}]*width:\s*32px/.test(css) &&
  /\.bee-crew \.crew-diamond img\s*\{[^}]*width:\s*36px/.test(css) &&
  6 * 32 + 36 + 6 * 6 <= 284);
check("bee: entry scene CSS — crew row, bob keyframes, diamond sparkle",
  css.includes(".bee-crew") && /@keyframes crew-bob/.test(css) && css.includes(".crew-sparkle") && !css.includes(".bee-home"));
check("bee: reveal maps points to states (175 gold, 100 honey, 90 drop, 75/55 normal, 35 and below thirsty)",
  appJs.includes("points >= 175") && appJs.includes('"bee-golden.png"') &&
  appJs.includes("points >= 100") && appJs.includes('"bee-little-honey.png"') &&
  appJs.includes("points >= 90") && appJs.includes('"bee-drop.png"') &&
  appJs.includes("points >= 55") && appJs.includes('"bee-normal.png"') &&
  appJs.includes('return "bee-thirsty.png"'));
check("bee: diamond streak maps a second consecutive 175 to the diamond bee",
  appJs.includes('"bee-diamond.png"') && appJs.includes("streak >= 2") &&
  appJs.includes("function beeForPoints(points, streak"));
check("bee: reveal renders the mapped bee image with the streak", appJs.includes('src="assets/${beeForPoints(r.points, streak)}"'));
check("bee: CSS keeps pixels crisp", /\.bee\{[^}]*image-rendering:\s*pixelated/.test(css));

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
// Black theme + top-anchored layout, no vertical centering.
check("black background set", css.includes("--bg:#000000") && css.includes("--card:#111111"));
check("no pure-white background left", !css.includes("--bg:#ffffff") && !css.includes("background:#fff;"));
check("unlit dots are dim charcoal", css.includes("--dot-unlit:#2e2e2e") && css.includes("background:var(--dot-unlit)"));
check("old unlit colors gone", !css.includes("#e3e5e8") && !css.includes("#c9bda0"));
check("main is top-anchored, not vertically centered",
  /main\s*\{[^}]*justify-content:\s*flex-start/.test(css) && !/main\s*\{[^}]*justify-content:\s*center/.test(css));
check("entry grid is the shared 188px size", /\.grid\.entry\s*\{[^}]*max-width:\s*188px/.test(css));
// 2026-11-16 entry-grid collapse (live-site bug): #entry-grid is a direct
// child of main#screen, a column FLEX container, and carries horizontal auto
// margins — so it is NOT stretched, and its width resolves to fit-content.
// The 10x10 grid's empty aspect-ratio dots gave it an intrinsic width of
// just the gaps (~27px), so the dots collapsed to 0px and the grid was
// invisible in a real browser even though the DOM had all 100 dots. The rows
// are fixed-width flex rows now, so the intrinsic width is the widest row
// (188px) — but the definite width stays as a guard.
check("entry grid has a definite width (flex-item collapse guard)",
  /\.grid\.entry\s*\{[^}]*width:\s*(100%|188px)/.test(css));
// How to Play: no scoring numbers anywhere in the overlay.
const howto = html.slice(html.indexOf('id="howto"'), html.indexOf('id="howto-close"'));
check("How to Play shows no scoring math", !/points off|=\s*\d|0[–-]20|\b\d+\s*pts\b/.test(howto));
check("How to Play keeps the no-math wording",
  howto.includes("The closer your guess, the more points. A perfect guess is a Bullseye."));
// 2026-11-18 real-stats reframe: modes are "Name the #1" / "Split the 100",
// no crowd wording in the overlay.
check("How to Play names the modes without crowd wording",
  howto.includes("Name the #1:") && howto.includes("type the most popular answer.") &&
  howto.includes("Split the 100:") && !/crowd/i.test(howto));
// 2026-11-17 Contribute honesty: researched answers are authoritative
// (server.js) and votes never change them — they are only stored and used to
// mark a question as already-voted. The live copy used to claim the opposite.
const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
check("Contribute copy never claims votes shape the crowd's numbers",
  !html.includes("shapes the crowd") && !appJs.includes("shapes the crowd") &&
  !readme.includes("shape the crowd") && readme.includes("Your vote is recorded."));
check("Contribute copy says the vote is recorded (how-to, home card, vote hint)",
  howto.includes("Your vote is recorded.") &&
  appJs.includes("Answer the real preference behind a question. Your vote is recorded.") &&
  appJs.includes("Your vote is recorded. Percentages are never shown."));
// 2026-11-17 space-question reword (wording only: answer/source unchanged).
check("Q78 space question is the plain rewording, answer and source unchanged",
  byId.get(78).text === "Of all the people who have ever been to space, what % went as a private citizen instead of a professional astronaut?" &&
  byId.get(78).answer === 17 &&
  byId.get(78).sourceUrl.includes("spacedaily.com"));
check("old Q78 wording gone from the bank",
  !bank.questions.some((q) => (q.text || "").includes("flew as a private citizen")));
// 2026-11-17 text-round reminder: visible above the text box while typing.
check("text rounds show the reminder above the text box",
  appJs.includes("Reminder: guess the most popular answer.") &&
  appJs.indexOf("Reminder: guess the most popular answer.") < appJs.indexOf('id="text-answer"'));
check("text rounds score the #1, no crowd wording",
  appJs.includes("One answer — the #1 scores the most.") && !appJs.includes("the crowd's #1 scores the most"));
check("Contribute empty state has the real-stats wording",
  appJs.includes("New ones appear as more questions are added.") && !appJs.includes("as the crowd grows"));

console.log("== unit: 2026-11-18 black theme (black + yellows + whites) ==");
// Theme values: one black theme, no light/dark split.
check("theme: bg/card/surface/gold/gold-bright/unlit exact",
  css.includes("--bg:#000000") && css.includes("--card:#111111") && css.includes("--surface:#111111") &&
  css.includes("--gold:#cf9a06") && css.includes("--gold-bright:#ffd60a") &&
  css.includes("--dot-unlit:#2e2e2e") && css.includes("color-scheme:dark"));
check("theme: old values gone",
  !css.includes("#faf5ec") && !css.includes("#fffdf7") && !css.includes("#1b2a4a") &&
  !css.includes("#d4a017") && !css.includes("#e4572e") && !css.includes("#c9bda0") &&
  !css.includes("#f4f1ec") && !css.includes("#fffdf9") && !css.includes("#232c42") &&
  !css.includes("#e8442e") && !css.includes("#e7e1d2") && !css.includes("#aebddb") &&
  !css.includes("#101623") && !css.includes("--navy") && !css.includes("--poppy"));
check("theme: main column is 620px wide", /#app\s*\{[^}]*max-width:\s*620px/.test(css));
check("theme: single black theme — no prefers-color-scheme block anywhere",
  !/@media\s*\(prefers-color-scheme:\s*dark\)/.test(css) && !/prefers-color-scheme/.test(css));
// One shared grid size everywhere: answering and reveal identical.
// 2026-11-18 big honeycomb: the grid is a flex column of centered .hrow
// rows, and the 3px gap lives on the rows, not the container — a container
// gap would add to the vertical row pitch.
check("grid: reveal grid is 188px, rows carry the 3px gap",
  /\.grid\s*\{[^}]*max-width:\s*188px/.test(css) && /\.grid \.hrow\s*\{[^}]*gap:\s*3px/.test(css) &&
  !/\.grid\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: entry grid is 188px (definite width, no container gap)",
  /\.grid\.entry\s*\{[^}]*max-width:\s*188px/.test(css) && !/\.grid\.entry\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: fine-tune grid is 224px, rows carry their own 4.5px gap (not the shared 3px)",
  /\.grid\.small\s*\{[^}]*max-width:\s*224px/.test(css) && /\.grid\.small \.hrow\s*\{[^}]*gap:\s*4\.5px/.test(css) &&
  !/\.grid\.small\s*\{[^}]*gap:\s*3px/.test(css));
// 2026-11-18 regular-hexagon rework: the 100 dots are hexagon cells in 13
// rows that grow then shrink, so together they form one big hexagon. Rows
// nest vertically with a negative bottom margin on the row (row pitch 3/4
// of the cell + 0.3px clearance above exact touching). Cells are REGULAR
// hexagons — height = (sqrt(3)/2) x width — so the dot carries an explicit
// height, not aspect-ratio:1. Main 12px x 10.4px, fine-tune 18px x 15.6px.
// The old 16.1px square cells made squat hexagons, an outline 45% off
// regular, and a row pitch that overlapped diagonally adjacent cells.
// Legend swatches are hexagons too.
check("grid: dots are hexagons (clip-path polygon, no border-radius)",
  /\.grid \.dot\s*\{[^}]*clip-path:\s*polygon\(/.test(css) &&
  !/\.grid \.dot\s*\{[^}]*border-radius:\s*50%/.test(css));
check("grid: main cells are regular hexagons, 12px wide x 10.4px tall; fine-tune 18px x 15.6px",
  /\.grid \.dot\s*\{[^}]*width:\s*12px/.test(css) && /\.grid \.dot\s*\{[^}]*height:\s*10\.4px/.test(css) &&
  /\.grid\.small \.dot\s*\{[^}]*width:\s*18px/.test(css) && /\.grid\.small \.dot\s*\{[^}]*height:\s*15\.6px/.test(css) &&
  !/\.grid \.dot\s*\{[^}]*aspect-ratio:\s*1/.test(css));
check("grid: rows nest vertically (negative bottom margin on .hrow, honeycomb pitch)",
  /\.grid \.hrow\s*\{[^}]*margin-bottom:\s*-2\.3px/.test(css));
check("grid: fine-tune grid nests too (small rows, -3.6px margin)",
  /\.grid\.small \.hrow\s*\{[^}]*margin-bottom:\s*-3\.6px/.test(css));
// Big-honeycomb geometry, by math from the CSS values (integer tenths, no
// float slop). Row lengths sum to exactly 100, the arrangement is symmetric
// (palindromic, grow then shrink), the widest row is 10 cells. The widest
// row fits its box at the declared cell size: main 10*120 + 9*30 = 1470
// (147px <= 188px), fine-tune 10*180 + 9*45 = 2205 (220.5px <= 224px).
// Regularity: the outline's top edge is (topRow-1)*(w+gap) + w/2 and each
// slant side is hypot(dx, dy) with dx = widest-row right point minus top
// edge right end and dy = (rows-1)*pitch/2 + h/2. New shape: top 81.0px,
// slant 82.8px — 2.2% apart (old shape: 84.5 vs 122.6, 45% apart). A
// perfect regular hexagon is impossible with exactly 100 cells (91 or 127
// would be); the check pins side deviation <= 3% and reports the numbers.
// No overlap: the row pitch (cell height + negative row margin) must sit
// above the touching pitch h*(1 - gap/w) — the old -4px margin overlapped
// diagonally adjacent cells by ~0.5px. One-screen budget: the grid
// element ((rows-1)*pitch + cell height + padding-bottom) must be <= 120px,
// so question + grid + reveal fit a 390x844 phone without scrolling
// (measured docScroll 831px <= 844 with the 114.6px grid).
const rowsMatch = appJs.match(/const ROWS = \[([\d,\s]+)\];/);
const BIG_HEX_ROWS = rowsMatch ? rowsMatch[1].split(",").map(Number) : [];
check("big honeycomb: 13 rows, symmetric, sum to exactly 100 cells",
  BIG_HEX_ROWS.length === 13 &&
  BIG_HEX_ROWS.reduce((a, b) => a + b, 0) === 100 &&
  JSON.stringify(BIG_HEX_ROWS) === JSON.stringify([...BIG_HEX_ROWS].reverse()) &&
  Math.max(...BIG_HEX_ROWS) === 10);
const cssNum = (re) => { const m = css.match(re); return m ? parseFloat(m[1]) : null; };
const t10 = (x) => Math.round(x * 10);
const gridGeo = (() => {
  const w = cssNum(/\.grid \.dot\s*\{[^}]*width:\s*([\d.]+)px/);
  const h = cssNum(/\.grid \.dot\s*\{[^}]*height:\s*([\d.]+)px/);
  const gap = cssNum(/\.grid \.hrow\s*\{[^}]*gap:\s*([\d.]+)px/);
  const mg = cssNum(/\.grid \.hrow\s*\{[^}]*margin-bottom:\s*(-?[\d.]+)px/);
  const pad = cssNum(/\.grid\s*\{[^}]*padding-bottom:\s*([\d.]+)px/);
  const sw = cssNum(/\.grid\.small \.dot\s*\{[^}]*width:\s*([\d.]+)px/);
  const sh = cssNum(/\.grid\.small \.dot\s*\{[^}]*height:\s*([\d.]+)px/);
  const sgap = cssNum(/\.grid\.small \.hrow\s*\{[^}]*gap:\s*([\d.]+)px/);
  const smg = cssNum(/\.grid\.small \.hrow\s*\{[^}]*margin-bottom:\s*(-?[\d.]+)px/);
  const spad = cssNum(/\.grid\.small\s*\{[^}]*padding-bottom:\s*([\d.]+)px/);
  if ([w, h, gap, mg, pad, sw, sh, sgap, smg, spad].some((v) => v == null)) return null;
  const pitch = h + mg; // row pitch = cell height + negative row margin
  const spitch = sh + smg;
  const m = Math.max(...BIG_HEX_ROWS);
  const topRow = BIG_HEX_ROWS[0];
  const k = BIG_HEX_ROWS.length;
  const top = t10((topRow - 1) * (w + gap) + w / 2);
  const dx = t10((m - 1) * (w + gap) + w - ((topRow - 1) * (w + gap) + 0.75 * w));
  const dy = t10((k - 1) * pitch / 2 + h / 2);
  const slant = t10(Math.hypot(dx / 10, dy / 10));
  return {
    widestMain: t10(m * w + (m - 1) * gap),
    widestSmall: t10(m * sw + (m - 1) * sgap),
    height: t10((k - 1) * pitch + h + pad),
    top, slant,
    sideDev: Math.abs(top - slant) / Math.min(top, slant),
    pitchClear: t10(pitch - h * (1 - gap / w)),
    spitchClear: t10(spitch - sh * (1 - sgap / sw)),
    cellRatio: h / w,
  };
})();
check("big honeycomb: geometry parses from CSS", !!gridGeo);
if (gridGeo) {
  check("big honeycomb: widest row fits the 188px box (147px)", gridGeo.widestMain === 1470);
  check("big honeycomb: fine-tune widest row fits the 224px box (220.5px)", gridGeo.widestSmall === 2205);
  check(`big honeycomb: outline sides near-equal — top ${gridGeo.top / 10}px, slant ${gridGeo.slant / 10}px, ${(gridGeo.sideDev * 100).toFixed(1)}% apart (<= 3%)`, gridGeo.sideDev <= 0.03);
  check("big honeycomb: cells are regular hexagons (height/width = sqrt(3)/2 within 0.01)",
    Math.abs(gridGeo.cellRatio - Math.sqrt(3) / 2) <= 0.01);
  check("big honeycomb: no cell overlap — row pitch sits 0.3px above exact touching (main and fine-tune)",
    gridGeo.pitchClear >= 2 && gridGeo.spitchClear >= 2);
  check(`big honeycomb: grid height ${gridGeo.height / 10}px fits the 120px one-screen budget`, gridGeo.height <= 1200);
}
check("legend: swatches are hexagons too",
  /\.legend \.sw\s*\{[^}]*clip-path:\s*polygon\(/.test(css) &&
  !/\.legend \.sw\s*\{[^}]*border-radius:\s*50%/.test(css));
check("legend: ring swatch uses the inset ring, not a border",
  /\.legend \.sw\.gold\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--gold-bright\)/.test(css) &&
  !/\.legend \.sw\.gold\s*\{[^}]*border:/.test(css));
// Rings are INSET everywhere they are used; no outset ring left. Since the
// 2026-11-17 reveal-readability fix, overlap dots are a solid yellow FILL, not
// a ring — so only the guess-entry dots and the fine-tune dots still ring,
// plus the legend ring swatch: three inset rings in total.
check("rings are inset (box-shadow: inset 0 0 0 2px var(--gold-bright))",
  (css.match(/box-shadow:\s*inset 0 0 0 2px var\(--gold-bright\)/g) || []).length === 3 &&
  !/box-shadow:\s*0 0 0 2px var\(--gold-bright\)/.test(css));
check("overlap dots are a solid yellow fill, not white + ring",
  /\.grid \.dot\.white\.gold\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css) &&
  /\.grid \.dot\.amber\.gold\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css) &&
  !/\.grid \.dot\.white\.gold\s*\{[^}]*box-shadow/.test(css) &&
  !/\.grid \.dot\.amber\.gold\s*\{[^}]*box-shadow/.test(css));
check("legend gold-fill swatch is solid bright yellow",
  /\.legend \.sw\.goldfill\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css));
// Split colors (2026-11-18): the two sides were white vs --gold (#cf9a06),
// and --gold sat only 1.80:1 from the bright-yellow player fill — the sides
// read as the same yellow at a glance. The split amber is now --amber-deep
// (#b45309), a deep saturated amber: 5.02:1 from white and 3.56:1 from the
// bright-yellow player fill, so white / amber / player-yellow are three
// instantly distinct fills. The player region stays bright-yellow fill.
check("split: dots, legend swatch and right label all use the deep amber, not --gold",
  /\.grid \.dot\.amber\s*\{[^}]*background:\s*var\(--amber-deep\)/.test(css) &&
  /\.legend \.sw\.amber\s*\{[^}]*background:\s*var\(--amber-deep\)/.test(css) &&
  /\.split-labels \.r\s*\{[^}]*color:\s*var\(--amber-deep\)/.test(css) &&
  !/\.grid \.dot\.amber\s*\{[^}]*background:\s*var\(--gold\)[^b]/.test(css));
check("split: deep amber is far from white (>= 4.5:1) and from the bright-yellow player fill (>= 3:1)",
  (() => {
    const relLum = (hexv) => {
      const ch = [0, 2, 4].map((i) => parseInt(hexv.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a, b) => { const la = relLum(a), lb = relLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const amber = (css.match(/--amber-deep:\s*#([0-9a-f]{6})/i) || [])[1];
    const bright = (css.match(/--gold-bright:\s*#([0-9a-f]{6})/i) || [])[1];
    if (!amber || !bright) return false;
    return ratio("ffffff", amber) >= 4.5 && ratio(bright, amber) >= 3;
  })());
check("guess-only dots are dark, not surface",
  /\.grid \.dot\.gold\s*\{[^}]*background:\s*#1a1a1a/.test(css));
check("fine-tune dots are yellow 28% mix over dark + inset ring",
  /\.grid \.dot\.ft\s*\{[^}]*color-mix\(in srgb,\s*var\(--gold-bright\) 28%,\s*#1a1a1a\)/.test(css) &&
  /\.grid \.dot\.ft\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--gold-bright\)/.test(css));
// Legends, exact text. Answering legend unchanged in meaning; reveal legends
// rewritten for the black theme (white crowd, yellow fill, yellow ring).
check("answering legend (Guess) is exactly 'Yellow ring = your guess'",
  appJs.includes("Yellow ring = your guess"));
check("reveal legend (Guess) is the exact three lines",
  appJs.includes("White = the real number") && appJs.includes("Yellow = you got these") && appJs.includes("Yellow ring = your guess only"));
check("reveal legend (Guess) uses the gold-fill swatch for 'you got these'",
  appJs.includes('<span class="sw goldfill"></span>Yellow = you got these'));
check("reveal legend (Split) uses white/amber swatches + yellow for your split",
  appJs.includes('<span class="sw white"></span>') && appJs.includes('<span class="sw amber"></span>') &&
  appJs.includes('<span class="sw goldfill"></span>Yellow = your split'));
check("old reveal legend copy gone",
  !appJs.includes("crowd ${r.answer}%") && !appJs.includes("Each dot is 0.01%") &&
  !appJs.includes("Both = you got these") && !appJs.includes("Gold ring = your split") &&
  !appJs.includes("Navy = the crowd") && !appJs.includes("Gold = you got these") &&
  !appJs.includes("Gold ring = your guess") && !appJs.includes("White = the crowd"));
check("reveal legend (Split) is labels + 'Yellow = your split'",
  appJs.includes("Yellow = your split") && appJs.includes('<span class="sw goldfill"></span>Yellow = your split'));
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
    const el = {
      className: "",
      children: [],
      classList: { add: (...c) => added.push(...c) },
      appendChild(ch) { this.children.push(ch); },
      _added: added,
    };
    // renderGrid nests dots inside .hrow rows now — querySelectorAll(".dot")
    // flattens them back to the row-major dot list the logic tests use.
    el.querySelectorAll = (sel) => {
      const out = [];
      const walk = (n) => { for (const ch of n.children || []) { if (sel === ".dot" && ch.className === "dot") out.push(ch); walk(ch); } };
      walk(el);
      return out;
    };
    return el;
  };
  const renderGrid = new Function("document", `${gridSrc}; return renderGrid;`)({ createElement: () => makeEl() });
  const runGrid = (spec) => {
    const c = makeEl();
    renderGrid(c, spec);
    return c.querySelectorAll(".dot");
  };
  const runGridRows = (spec) => {
    const c = makeEl();
    renderGrid(c, spec);
    return c.children; // the .hrow rows
  };
  // Big-honeycomb row structure: 13 rows, lengths grow then shrink, 100
  // dots total in row-major order.
  const hexRows = runGridRows({ entry: "guess", value: 50 });
  check("big honeycomb: renderGrid builds 13 .hrow rows with lengths [6,6,7,8,9,9,10,9,9,8,7,6,6]",
    hexRows.length === 13 && hexRows.every((r) => r.className === "hrow") &&
    JSON.stringify(hexRows.map((r) => r.children.length)) === JSON.stringify([6, 6, 7, 8, 9, 9, 10, 9, 9, 8, 7, 6, 6]));
  check("big honeycomb: rows hold 100 dots in row-major order",
    hexRows.reduce((n, r) => n + r.children.length, 0) === 100 &&
    runGrid({ entry: "guess", value: 50 }).length === 100);
  const has = (dots, i, ...names) => names.every((n) => dots[i]._added.includes(n));
  const noneHas = (dots, ...names) => dots.every((d) => !names.some((n) => d._added.includes(n)));

  let dots = runGrid({ entry: "guess", value: 50 });
  check("entry guess 50: gold rings on first 50 dots, no crowd colors",
    dots.length === 100 && dots.slice(0, 50).every((d) => d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0) && noneHas(dots, "white", "amber"));
  dots = runGrid({ entry: "guess", value: 0 });
  check("entry guess 0: no dots lit", dots.every((d) => d._added.length === 0));
  dots = runGrid({ entry: "guess", value: 37 });
  check("entry hundredths 37: gold rings on first 37 dots only",
    dots.slice(0, 37).every((d) => d._added.includes("gold")) && dots.slice(37).every((d) => d._added.length === 0));
  dots = runGrid({ entry: "fine", value: 37 });
  check("fine-tune 37: gold-mix dots on first 37 only",
    dots.slice(0, 37).every((d) => d._added.includes("ft")) && dots.slice(37).every((d) => d._added.length === 0) && noneHas(dots, "gold", "white", "amber"));
  dots = runGrid({ entry: "split", left: 35 });
  check("entry split 35/65: white left, amber right, NO gold ring while answering",
    dots.slice(0, 35).every((d) => d._added.includes("white")) &&
    dots.slice(35).every((d) => d._added.includes("amber")) && noneHas(dots, "gold"));
  dots = runGrid({ crowd: 29, guess: 50 });
  check("reveal guess 50 vs crowd 29: overlap white+gold 0-28, guess-only gold 29-49, rest unlit",
    dots.slice(0, 29).every((d) => d._added.includes("white") && d._added.includes("gold")) &&
    dots.slice(29, 50).every((d) => d._added.includes("gold") && !d._added.includes("white")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ crowd: 50, guess: 50 });
  check("reveal exact match: every filled dot is white + gold",
    dots.slice(0, 50).every((d) => d._added.includes("white") && d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ crowd: 50, guess: 20 });
  check("reveal guess below crowd: overlap 0-19 white+gold, crowd-only 20-49 white, rest unlit",
    dots.slice(0, 20).every((d) => d._added.includes("white") && d._added.includes("gold")) &&
    dots.slice(20, 50).every((d) => d._added.includes("white") && !d._added.includes("gold")) &&
    dots.slice(50).every((d) => d._added.length === 0));
  dots = runGrid({ split: { left: 65, right: 35 }, playerSplit: 35 });
  check("reveal split: crowd halves white/amber, yellow fill on dots up to player's split only",
    dots.slice(0, 65).every((d) => d._added.includes("white")) &&
    dots.slice(65).every((d) => d._added.includes("amber")) &&
    dots.slice(0, 35).every((d) => d._added.includes("gold")) &&
    dots.slice(35).every((d) => !d._added.includes("gold")));
}

console.log("== unit: 2026-11-18 in-place reveal + diamond streak ==");
// Reveal copy: real-stats wording, no crowd wording.
check("reveal answer line names the real number, not the crowd",
  appJs.includes("the real number is") && !appJs.includes("the crowd says"));
check("reveal legend (Guess) names the real number",
  appJs.includes("White = the real number") && !appJs.includes("White = the crowd"));
check("text reveal says 'not on the list'",
  appJs.includes("not on the list") && !appJs.includes("not in the crowd's list"));
// In-place: showReveal must not replace the round screen with a separate
// card — it hides the answering controls, re-renders the on-screen entry
// grid, and inserts the tier + bee + answer + Next block in place.
const revealSrc = appJs.slice(appJs.indexOf("function showReveal(r)"), appJs.indexOf("function escapeHtml"));
check("in-place reveal: showReveal does not replace the screen with a separate card",
  revealSrc.length > 100 && !revealSrc.includes("screen.innerHTML"));
check("in-place reveal: answering controls are hidden and the on-screen grid is re-rendered",
  revealSrc.includes('classList.add("hidden")') && revealSrc.includes('$("#entry-grid")') &&
  revealSrc.includes('grid.after(reveal)') && revealSrc.includes('reveal.id = "reveal"') &&
  revealSrc.includes('id="next"'));
check("in-place reveal: old whole-card burst is gone",
  !/@keyframes burst\{/.test(css) && !/\.burst\s*\{/.test(css) && !appJs.includes("const burst"));
check("in-place reveal: grid fill animation is staggered per cell",
  /\.grid\.reveal-fill \.dot\s*\{[^}]*animation:\s*cell-fill/.test(css) &&
  /@keyframes cell-fill/.test(css) && appJs.includes("reveal-fill") &&
  appJs.includes("animationDelay"));
// Bee entrances: one distinct entrance class per tier + diamond, CSS
// keyframes (transform/opacity), honey splash and diamond sparkle elements.
check("bee entrances: all five entrance classes exist in CSS",
  css.includes(".bee-entrance-burst") && css.includes(".bee-entrance-honey") &&
  css.includes(".bee-entrance-pop") && css.includes(".bee-entrance-gentle") &&
  css.includes(".bee-entrance-diamond"));
check("bee entrances: keyframes for burst / honey / pop / gentle / diamond + splash + sparkle",
  /@keyframes bee-burst/.test(css) && /@keyframes bee-honey-in/.test(css) &&
  /@keyframes bee-pop/.test(css) && /@keyframes bee-gentle/.test(css) &&
  /@keyframes bee-diamond/.test(css) && /@keyframes honey-splash/.test(css) &&
  /@keyframes diamond-sparkle/.test(css));
check("bee entrances: honey splash and diamond sparkle elements are rendered by showReveal",
  appJs.includes("honey-splash") && appJs.includes("diamond-sparkle") &&
  appJs.includes("function beeEntranceFor"));
check("bee entrances: diamond entrance is the biggest burst (scale 1.4 peak)",
  (() => { const s = css.indexOf("@keyframes bee-diamond"); const e = css.indexOf("@keyframes diamond-sparkle", s); return s !== -1 && e !== -1 && css.slice(s, e).includes("scale(1.4)"); })());
// Diamond streak mapping, run against the real functions (pure + testable).
const beeSrc = extractFn(appJs, "beeForPoints");
check("beeForPoints source extractable for logic test", !!beeSrc);
if (beeSrc) {
  const beeForPoints = new Function(`${beeSrc}; return beeForPoints;`)();
  check("diamond streak: first 175 = gold", beeForPoints(175, 0) === "bee-golden.png" && beeForPoints(175, 1) === "bee-golden.png");
  check("diamond streak: second consecutive 175 = diamond", beeForPoints(175, 2) === "bee-diamond.png");
  check("diamond streak: third+ consecutive 175 stays diamond", beeForPoints(175, 3) === "bee-diamond.png" && beeForPoints(175, 9) === "bee-diamond.png");
  check("diamond streak: streak does not change sub-175 mapping",
    beeForPoints(100, 2) === "bee-little-honey.png" && beeForPoints(90, 2) === "bee-drop.png" && beeForPoints(5, 2) === "bee-thirsty.png");
  // Warm bee (2026-11-18): Warm (55) and Close (75) are fine, not sick —
  // they get the NORMAL bee. Only Lukewarm (35) and below get thirsty.
  check("warm bee: 75 and 55 map to the normal bee, not thirsty",
    beeForPoints(75, 0) === "bee-normal.png" && beeForPoints(55, 0) === "bee-normal.png");
  check("warm bee: 35 and below still map to the thirsty bee",
    beeForPoints(35, 0) === "bee-thirsty.png" && beeForPoints(15, 0) === "bee-thirsty.png" && beeForPoints(5, 0) === "bee-thirsty.png");
}
const streakSrc = extractFn(appJs, "bullseyeStreak");
check("bullseyeStreak source extractable for logic test", !!streakSrc);
if (streakSrc) {
  const streakOf = (results) => new Function("currentPlay", `${streakSrc}; return bullseyeStreak();`)({ results });
  check("streak: trailing run counts consecutive 175s", streakOf([{ points: 175 }, { points: 175 }]) === 2);
  check("streak: resets the moment a round scores below 175",
    streakOf([{ points: 175 }, { points: 175 }, { points: 90 }]) === 0 &&
    streakOf([{ points: 175 }, { points: 100 }, { points: 175 }]) === 1);
  check("streak: empty play is zero", streakOf([]) === 0);
}
const entranceSrc = extractFn(appJs, "beeEntranceFor");
check("beeEntranceFor source extractable for logic test", !!entranceSrc);
if (entranceSrc) {
  const beeEntranceFor = new Function(`${entranceSrc}; return beeEntranceFor;`)();
  check("entrances: 175 first = burst, 175 second+ = diamond",
    beeEntranceFor(175, 0) === "bee-entrance-burst" && beeEntranceFor(175, 1) === "bee-entrance-burst" &&
    beeEntranceFor(175, 2) === "bee-entrance-diamond" && beeEntranceFor(175, 3) === "bee-entrance-diamond");
  check("entrances: 100 = honey, 90 = pop, lower = gentle",
    beeEntranceFor(100, 0) === "bee-entrance-honey" && beeEntranceFor(90, 0) === "bee-entrance-pop" &&
    beeEntranceFor(75, 0) === "bee-entrance-gentle" && beeEntranceFor(5, 0) === "bee-entrance-gentle");
}
check("diamond streak: showReveal derives the streak from currentPlay.results and passes it through",
  revealSrc.includes("bullseyeStreak()") && revealSrc.includes("beeForPoints(r.points, streak)") &&
  revealSrc.includes("beeEntranceFor(r.points, streak)"));
check("diamond streak: text rounds feed the same streak (no kind gate on the bee)",
  !/isText \? [^:]*bee/.test(revealSrc) && revealSrc.includes('src="assets/${beeForPoints(r.points, streak)}"'));
// Ruby bee (Luke's rule): a run finishing at 900+ total points shows a ruby
// bee on the results screen. Results-screen celebration only — it never
// replaces a per-round reveal bee (beeForPoints knows no ruby).
const rubySrc = extractFn(appJs, "rubyForScore");
check("rubyForScore source extractable for logic test", !!rubySrc);
if (rubySrc) {
  const rubyForScore = new Function(`${rubySrc}; return rubyForScore;`)();
  check("ruby bee: 900+ shows ruby, below 900 shows nothing",
    rubyForScore(900) === "bee-ruby.png" && rubyForScore(1225) === "bee-ruby.png" &&
    rubyForScore(899) === null && rubyForScore(0) === null && rubyForScore(650) === null);
}
const resultsSrc = extractFn(appJs, "showResults");
check("ruby bee: results screen renders the ruby bee with burst + sparkle at 900+",
  resultsSrc.includes("rubyForScore(play.score)") && resultsSrc.includes("bee-entrance-ruby") &&
  resultsSrc.includes("ruby-sparkle") && resultsSrc.includes("ruby-label") &&
  resultsSrc.includes('src="assets/${ruby}"'));
check("ruby bee: reveal mapping untouched (no ruby in beeForPoints)",
  !!beeSrc && !beeSrc.includes("ruby"));
check("ruby bee: CSS entrance + sparkle keyframes, biggest burst (scale 1.4 peak)",
  css.includes(".bee-entrance-ruby") && /@keyframes bee-ruby/.test(css) &&
  css.includes(".ruby-sparkle") && /@keyframes ruby-sparkle/.test(css) &&
  (() => { const s = css.indexOf("@keyframes bee-ruby"); const e = css.indexOf("@keyframes ruby-sparkle", s); return s !== -1 && e !== -1 && css.slice(s, e).includes("scale(1.4)"); })());

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
// The wordmark markup splits Y and L into .tight spans (tracking fix), so
// the contiguous string "HONEYDLE" is not in the raw HTML — check the text
// content instead, and pin the tight spans in the served markup.
const homePlain = homeText.replace(/<[^>]+>/g, "");
check("served index.html carries new tagline + HONEYDLE wordmark + fonts, old tagline gone",
  homeText.includes("How well do you know the world?") && homePlain.includes("HONEYDLE") &&
  homeText.includes('<span class="tight">Y</span>') && homeText.includes('<span class="tight">L</span>') &&
  homeText.includes("fonts.googleapis.com/css2?family=Press+Start+2P") &&
  !homeText.includes("what do people usually do?"));

const servedCss = await (await fetch(BASE + "/styles.css")).text();
check("served styles.css has black theme + shared 188px grid + inset rings, no light theme",
  servedCss.includes("--bg:#000000") && servedCss.includes("--gold-bright:#ffd60a") &&
  servedCss.includes("--dot-unlit:#2e2e2e") && servedCss.includes("color-scheme:dark") &&
  servedCss.includes("max-width:188px") && servedCss.includes("box-shadow:inset 0 0 0 2px var(--gold-bright)") &&
  !servedCss.includes("@media (prefers-color-scheme: dark)") && !servedCss.includes("--bg:#f4f1ec") &&
  !servedCss.includes("Fraunces"));
check("served styles.css has top-anchored main, no vertical centering",
  /main\s*\{[^}]*justify-content:\s*flex-start/.test(servedCss) && !/main\s*\{[^}]*justify-content:\s*center/.test(servedCss));
const servedJs = await (await fetch(BASE + "/app.js")).text();
check("served app.js renders entry grid on Guess/Split answering screens",
  (servedJs.match(/id="entry-grid"/g) || []).length === 2);
check("served app.js entry grid uses gold-only modes, no crowd data",
  servedJs.includes('entry: "guess"') && servedJs.includes('entry: "split"'));
check("served app.js has exact legends + playerSplit reveal + fine-tune spec",
  servedJs.includes("Yellow ring = your guess") && servedJs.includes("White = the real number") &&
  servedJs.includes("Yellow = you got these") && servedJs.includes("Yellow ring = your guess only") &&
  servedJs.includes("Yellow = your split") && servedJs.includes("the real number is") &&
  !servedJs.includes("Both = you got these") && !servedJs.includes("White = the crowd") &&
  !servedJs.includes("the crowd says") && !servedJs.includes("Gold ring = your split") &&
  servedJs.includes("playerSplit: r.guess") && servedJs.includes('entry: "fine"'));
const servedHowto = homeText.slice(homeText.indexOf('id="howto"'), homeText.indexOf('id="howto-close"'));
check("served How to Play shows no scoring math", !/points off|=\s*\d|0[–-]20|\b\d+\s*pts\b/.test(servedHowto));
const beeRes = await fetch(BASE + "/assets/bee-golden.png");
check("served bee asset returns a PNG", beeRes.ok && (beeRes.headers.get("content-type") || "").includes("image/png"));
const beeDiamondRes = await fetch(BASE + "/assets/bee-diamond.png");
check("served diamond bee asset returns a PNG", beeDiamondRes.ok && (beeDiamondRes.headers.get("content-type") || "").includes("image/png"));
const beeRubyRes = await fetch(BASE + "/assets/bee-ruby.png");
check("served ruby bee asset returns a PNG", beeRubyRes.ok && (beeRubyRes.headers.get("content-type") || "").includes("image/png"));
check("served app.js wires the bee (mapping + home idle + reveal + diamond streak)", servedJs.includes("beeForPoints") && servedJs.includes('assets/bee-normal.png') && servedJs.includes("bee-golden.png") && servedJs.includes("bee-thirsty.png") && servedJs.includes("bee-diamond.png") && servedJs.includes("beeEntranceFor") && servedJs.includes("bullseyeStreak"));
check("served app.js wires the entry crew + ruby bee (900 rule + results render)",
  servedJs.includes("bee-crew") && servedJs.includes("bee-diamond.png") &&
  servedJs.includes("rubyForScore") && servedJs.includes("bee-ruby.png") && servedJs.includes("900"));
check("served styles.css has the five bee entrances + diamond keyframes, old burst gone",
  servedCss.includes(".bee-entrance-burst") && servedCss.includes(".bee-entrance-honey") &&
  servedCss.includes(".bee-entrance-pop") && servedCss.includes(".bee-entrance-gentle") &&
  servedCss.includes(".bee-entrance-diamond") && servedCss.includes("@keyframes bee-diamond") &&
  servedCss.includes("@keyframes cell-fill") && !/@keyframes burst\{/.test(servedCss));
check("served styles.css has the ruby entrance + sparkle keyframes and the crew bob",
  servedCss.includes(".bee-entrance-ruby") && servedCss.includes("@keyframes bee-ruby") &&
  servedCss.includes(".ruby-sparkle") && servedCss.includes(".bee-crew") && servedCss.includes("@keyframes crew-bob"));

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
check("contribute never shows the 'Is this you?' fallback", unlocked.body.questions.every((q) => q.votePrompt !== "Is this you?") && unlocked.body.questions.every((q) => q.kind === "split" || q.votePrompt.endsWith("?")));
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
  hundredthsOk = s.body.result?.points === 100 && s.body.result?.tier === "One Off";
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
// (100 dots, right classes) — the grid collapsed to ~0px in a real browser
// because #entry-grid is a flex item of main#screen with auto margins and no
// definite width. A stub test cannot catch that, so this section loads the
// real served page in jsdom and drives a full Endless play in the real DOM:
// the entry grid must have 100 dots with the right classes after render
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
  const kids = [...el.querySelectorAll(".dot")];
  const has = (name) => kids.filter((k) => k.classList.contains(name)).length;
  return { n: kids.length, gold: has("gold"), white: has("white"), amber: has("amber"), ft: has("ft") };
};
await waitForDom(() => domDoc.querySelector("#btn-endless"), "home Endless button");
domDoc.querySelector("#btn-endless").click();
let domEntryOk = true, domRevealOk = true, domInPlaceOk = true;
for (let round = 1; round <= 7; round++) {
  await waitForDom(() => domDoc.querySelector("#slider") || domDoc.querySelector("#text-answer"), `round ${round} controls`);
  await sleep(200);
  const isText = !!domDoc.querySelector("#text-answer");
  if (!isText) {
    const isSplit = !!domDoc.querySelector(".split-labels");
    const entry = gridCounts(domDoc.querySelector("#entry-grid"));
    if (isSplit) {
      if (!(entry && entry.n === 100 && entry.white === 50 && entry.amber === 50 && entry.gold === 0)) domEntryOk = false;
    } else {
      if (!(entry && entry.n === 100 && entry.gold === 50 && entry.white === 0)) domEntryOk = false;
    }
    // Slider input must re-light the grid live (the exact gesture the bug hid).
    const s = domDoc.querySelector("#slider");
    s.value = isSplit ? "96" : "70";
    s.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await sleep(200);
    const after = gridCounts(domDoc.querySelector("#entry-grid"));
    if (isSplit) {
      if (!(after && after.n === 100 && after.white === 96 && after.amber === 4 && after.gold === 0)) domEntryOk = false;
    } else {
      if (!(after && after.n === 100 && after.gold === 70 && after.white === 0)) domEntryOk = false;
    }
  } else {
    domDoc.querySelector("#text-answer").value = "verify answer";
  }
  domDoc.querySelector("#submit").click();
  await waitForDom(() => domDoc.querySelector("#next") || domDoc.querySelector(".score-big"), `round ${round} reveal/results`);
  await sleep(200);
  // In-place reveal: the round screen stays — question text and the same
  // entry grid are still there with the reveal block on the same screen,
  // and the answering controls are hidden.
  if (!domDoc.querySelector(".qtext") || !domDoc.querySelector("#next")) domInPlaceOk = false;
  if (!isText && !domDoc.querySelector("#entry-grid")) domInPlaceOk = false;
  const sliderEl = domDoc.querySelector("#slider");
  if (sliderEl && !sliderEl.classList.contains("hidden") && !sliderEl.closest(".controls")?.classList.contains("hidden")) domInPlaceOk = false;
  const textEl = domDoc.querySelector("#text-answer");
  if (textEl && !textEl.closest(".type-row")?.classList.contains("hidden")) domInPlaceOk = false;
  if (!domDoc.querySelector("#reveal")) domInPlaceOk = false;
  const reveal = domDoc.querySelector("#entry-grid");
  if (reveal) {
    const rc = gridCounts(reveal);
    if (!(rc && rc.n === 100)) domRevealOk = false;
  }
  const next = domDoc.querySelector("#next");
  if (next) next.click();
}
await waitForDom(() => domDoc.querySelector(".score-big"), "results screen");
check("real DOM: entry grid has 100 dots, right classes, on every Guess/Split round (render + slider input)", domEntryOk);
check("real DOM: reveal grid has 100 dots after every submit", domRevealOk);
check("real DOM: reveal is in place — round screen, grid and question stay, controls hidden, #reveal present", domInPlaceOk);
check("real DOM: no JS errors during the full Endless play", jsdomErrors.length === 0, jsdomErrors.join(" | "));
dom.window.close();

console.log("== integration: black theme — contrast on black (served CSS) ==");
// 2026-11-18 theme redirect: one black theme, no light/dark split. The
// 2026-11-17 contrast rule still holds — every text element needs >= 4.5:1
// contrast against its effective background (WCAG AA bar for normal text),
// and no text may compute to black on the black surfaces. The disabled
// input is intentionally muted, so it gets a 4.0 bar instead.
const diskCss = fs.readFileSync(path.join(__dirname, "..", "client", "styles.css"), "utf8");
check("served styles.css is byte-identical to the repo file", servedCss === diskCss);
check("black theme: no prefers-color-scheme block in the served CSS", !servedCss.includes("prefers-color-scheme"));
function lum(rgb) {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b] = m[1].split(",").slice(0, 3).map((v) => Number(v.trim()) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  if (l1 == null || l2 == null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const darkHtml = `<!doctype html><html><head><style>${servedCss}</style></head><body>
<p id="body-text">body</p>
<div class="card">
  <div class="type-row"><input type="number" id="typed" value="50"></div>
  <div class="type-row"><input type="text" id="text-answer" value="hi"></div>
  <div class="type-row"><input type="number" id="typed-disabled" value="50" disabled></div>
  <div class="big-guess"><span id="guess-num">50</span></div>
  <button class="ghost" id="ghost-btn">x</button>
  <button class="primary" id="primary-btn">x</button>
  <button class="vote-no" id="vote-no-btn">x</button>
</div>
<span class="chip" id="chip">x</span>
<button class="finetune-btn" id="ft-btn">x</button>
<div class="nudge" id="nudge">x</div>
</body></html>`;
const darkDom = new JSDOM(darkHtml, { pretendToBeVisual: true });
const dcs = darkDom.window.getComputedStyle;
const ddoc = darkDom.window.document;
function effBg(el) {
  let node = el;
  while (node) {
    const bg = dcs(node).backgroundColor;
    if (bg && bg !== "transparent" && !/^rgba\(0, 0, 0, 0\)$/.test(bg)) return bg;
    node = node.parentElement;
  }
  return "rgb(0, 0, 0)";
}
const darkTargets = ["#body-text", "#typed", "#text-answer", "#guess-num", "#ghost-btn", "#primary-btn", "#vote-no-btn", "#chip", "#ft-btn", "#nudge"];
const darkBad = [];
for (const sel of darkTargets) {
  const el = ddoc.querySelector(sel);
  const fg = dcs(el).color;
  const bg = effBg(el);
  const ratio = contrast(fg, bg);
  if (ratio == null || ratio < 4.5) darkBad.push(`${sel}: ${fg} on ${bg} = ${ratio === null ? "?" : ratio.toFixed(2)}`);
  if (/^rgb\(0, 0, 0\)$/.test(fg)) darkBad.push(`${sel}: computed black text`);
}
check("black theme: every text element has >= 4.5:1 contrast, no black text on black (jsdom computed style)", darkBad.length === 0, darkBad.join(" | "));
{
  const el = ddoc.querySelector("#typed-disabled");
  const ratio = contrast(dcs(el).color, effBg(el));
  check("black theme: disabled input stays readable (muted, >= 4.0:1)", ratio !== null && ratio >= 4.0, `${dcs(el).color} on ${effBg(el)} = ${ratio === null ? "?" : ratio.toFixed(2)}`);
}
check("black theme: placeholder rule exists and uses the muted variable", /\.type-row input::placeholder\s*\{[^}]*color:\s*var\(--muted\)/.test(servedCss));
check("black theme: .big-guess is bright yellow (not black)", dcs(ddoc.querySelector("#guess-num")).color === "rgb(255, 214, 10)");
darkDom.window.close();

// 2026-11-18 theme redirect: the four reveal states must be instantly
// distinct on computed style in the single black theme — crowd-only white,
// overlap solid bright yellow, guess-only dark + yellow inset ring, unlit
// charcoal. Yellow fill = you, everywhere on the reveal.
function gridDotBgs(cssText) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${cssText}</style></head><body>
<div class="grid">
  <div class="dot white" id="d-crowd"></div>
  <div class="dot white gold" id="d-overlap"></div>
  <div class="dot amber gold" id="d-split"></div>
  <div class="dot gold" id="d-guessonly"></div>
  <div class="dot" id="d-unlit"></div>
</div></body></html>`, { pretendToBeVisual: true });
  const cs = dom.window.getComputedStyle;
  const doc = dom.window.document;
  const out = {
    crowd: cs(doc.querySelector("#d-crowd")).backgroundColor,
    overlap: cs(doc.querySelector("#d-overlap")).backgroundColor,
    split: cs(doc.querySelector("#d-split")).backgroundColor,
    guessOnly: cs(doc.querySelector("#d-guessonly")).backgroundColor,
    guessOnlyRing: cs(doc.querySelector("#d-guessonly")).boxShadow,
    unlit: cs(doc.querySelector("#d-unlit")).backgroundColor,
    // honeycomb: the hexagon clip-path must survive as a computed style,
    // and the inset ring must still be computed on the clipped dot.
    clip: cs(doc.querySelector("#d-guessonly")).clipPath,
  };
  dom.window.close();
  return out;
}
const blackDots = gridDotBgs(servedCss);
check("black theme: overlap yellow, crowd-only white, guess-only dark + ring, unlit charcoal — all four distinct",
  blackDots.overlap === "rgb(255, 214, 10)" && blackDots.crowd === "rgb(255, 255, 255)" &&
  blackDots.split === "rgb(255, 214, 10)" && blackDots.guessOnly === "rgb(26, 26, 26)" &&
  blackDots.unlit === "rgb(46, 46, 46)" &&
  blackDots.overlap !== blackDots.crowd && blackDots.crowd !== blackDots.unlit &&
  blackDots.overlap !== blackDots.unlit && blackDots.guessOnly !== blackDots.unlit &&
  /inset/.test(blackDots.guessOnlyRing) && blackDots.guessOnlyRing.includes("255, 214, 10"), JSON.stringify(blackDots));
check("black theme: dots carry the hexagon clip-path in computed style (ring intact on the clipped dot)",
  /^polygon\(/.test(blackDots.clip || "") && (blackDots.clip || "").includes("100% 50%") &&
  /inset/.test(blackDots.guessOnlyRing), blackDots.clip || "(no clip-path)");

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
