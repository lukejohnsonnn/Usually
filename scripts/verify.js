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
check("brand: header wordmark is HONEYDLE", html.includes(`<div class="brand">HONEYDLE</div>`));
check("brand: cache-bust bumped to honeydle2", html.includes("styles.css?v=honeydle2") && html.includes("app.js?v=honeydle2"));
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

// Bee mascot (2026-11-18): five pixel-art states in client/assets, wired by
// points in showReveal (175 gold, 100 head-to-toe honey, 90 one drop, else
// thirsty) + the idle bee on the home screen. Dots stay circles — no honeycomb.
const BEE_FILES = ["bee-normal.png", "bee-golden.png", "bee-little-honey.png", "bee-drop.png", "bee-thirsty.png"];
const beeBufs = BEE_FILES.map((f) => { try { return fs.readFileSync(path.join(__dirname, "..", "client", "assets", f)); } catch { return null; } });
check("bee: all five state PNGs exist in client/assets", beeBufs.every(Boolean));
check("bee: all five are real PNGs (magic bytes)", beeBufs.every((b) => b && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47));
check("bee: home screen shows the idle bee", appJs.includes('src="assets/bee-normal.png"'));
check("bee: reveal maps points to states (175 gold, 100 honey, 90 drop, else thirsty)",
  appJs.includes("points >= 175") && appJs.includes('"bee-golden.png"') &&
  appJs.includes("points >= 100") && appJs.includes('"bee-little-honey.png"') &&
  appJs.includes("points >= 90") && appJs.includes('"bee-drop.png"') &&
  appJs.includes('return "bee-thirsty.png"'));
check("bee: reveal renders the mapped bee image", appJs.includes('src="assets/${beeForPoints(r.points)}"'));
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
check("grid: reveal grid is 188px / 3px gap",
  /\.grid\s*\{[^}]*max-width:\s*188px/.test(css) && /\.grid\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: entry grid is 188px / 3px gap",
  /\.grid\.entry\s*\{[^}]*max-width:\s*188px/.test(css) && /\.grid\.entry\s*\{[^}]*gap:\s*3px/.test(css));
check("grid: fine-tune grid is 224px / 3px gap",
  /\.grid\.small\s*\{[^}]*max-width:\s*224px/.test(css) && /\.grid\.small\s*\{[^}]*gap:\s*3px/.test(css));
// Rings are INSET everywhere they are used; no outset ring left. Since the
// 2026-11-17 reveal-readability fix, overlap dots are a solid yellow FILL, not
// a ring — so only the guess-entry dots and the fine-tune dots still ring.
check("rings are inset (box-shadow: inset 0 0 0 2px var(--gold-bright))",
  (css.match(/box-shadow:\s*inset 0 0 0 2px var\(--gold-bright\)/g) || []).length === 2 &&
  !/box-shadow:\s*0 0 0 2px var\(--gold-bright\)/.test(css));
check("overlap dots are a solid yellow fill, not white + ring",
  /\.grid \.dot\.white\.gold\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css) &&
  /\.grid \.dot\.amber\.gold\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css) &&
  !/\.grid \.dot\.white\.gold\s*\{[^}]*box-shadow/.test(css) &&
  !/\.grid \.dot\.amber\.gold\s*\{[^}]*box-shadow/.test(css));
check("legend gold-fill swatch is solid bright yellow",
  /\.legend \.sw\.goldfill\s*\{[^}]*background:\s*var\(--gold-bright\)/.test(css));
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
  appJs.includes("White = the crowd") && appJs.includes("Yellow = you got these") && appJs.includes("Yellow ring = your guess only"));
check("reveal legend (Guess) uses the gold-fill swatch for 'you got these'",
  appJs.includes('<span class="sw goldfill"></span>Yellow = you got these'));
check("reveal legend (Split) uses white/amber swatches + yellow for your split",
  appJs.includes('<span class="sw white"></span>') && appJs.includes('<span class="sw amber"></span>') &&
  appJs.includes('<span class="sw goldfill"></span>Yellow = your split'));
check("old reveal legend copy gone",
  !appJs.includes("crowd ${r.answer}%") && !appJs.includes("Each dot is 0.01%") &&
  !appJs.includes("Both = you got these") && !appJs.includes("Gold ring = your split") &&
  !appJs.includes("Navy = the crowd") && !appJs.includes("Gold = you got these") &&
  !appJs.includes("Gold ring = your guess"));
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
check("served index.html carries new tagline + HONEYDLE wordmark + fonts, old tagline gone",
  homeText.includes("How well do you know the world?") && homeText.includes("HONEYDLE") &&
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
  servedJs.includes("Yellow ring = your guess") && servedJs.includes("White = the crowd") &&
  servedJs.includes("Yellow = you got these") && servedJs.includes("Yellow ring = your guess only") &&
  servedJs.includes("Yellow = your split") && !servedJs.includes("Both = you got these") &&
  !servedJs.includes("Gold ring = your split") &&
  servedJs.includes("playerSplit: r.guess") && servedJs.includes('entry: "fine"'));
const servedHowto = homeText.slice(homeText.indexOf('id="howto"'), homeText.indexOf('id="howto-close"'));
check("served How to Play shows no scoring math", !/points off|=\s*\d|0[–-]20|\b\d+\s*pts\b/.test(servedHowto));
const beeRes = await fetch(BASE + "/assets/bee-golden.png");
check("served bee asset returns a PNG", beeRes.ok && (beeRes.headers.get("content-type") || "").includes("image/png"));
check("served app.js wires the bee (mapping + home idle + reveal)", servedJs.includes("beeForPoints") && servedJs.includes('assets/bee-normal.png') && servedJs.includes("bee-golden.png") && servedJs.includes("bee-thirsty.png"));

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
  return { n: kids.length, gold: has("gold"), white: has("white"), amber: has("amber"), ft: has("ft") };
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
