// End-to-end verification for Usually. Spawns the real server against a throwaway
// local file store, plays a full daily + endless, and checks Contribute, the
// freeze, stats, and scoring. Run: npm run verify  (or: node scripts/verify.js)
// Exit 0 = all checks passed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scoreGuess, scoreText, matchTextAnswer, normalizeText,
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
check("unlisted stays unlisted", matchTextAnswer(byId.get(106), "sick").rank === null);
check("alias: my car broke down = rank 3", matchTextAnswer(byId.get(106), "my car broke down").rank === 3);
check("normalize strips articles", normalizeText("A phone screen") === "phone screen");

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
check("half-court reads 'within 5 tries', answer 28",
  byId.get(142)?.text === "What % of people think they could sink a half-court shot within 5 tries?" && byId.get(142)?.answer === 28);
check("half-court vote prompt updated",
  byId.get(142)?.votePrompt === "Could you sink a half-court shot within 5 tries?");
check("bank is 119 questions (60 guess, 19 split, 10 finale, 30 text)",
  bank.questions.length === 119 &&
  bank.questions.filter((q) => q.kind === "guess" && !q.finale).length === 60 &&
  bank.questions.filter((q) => q.kind === "split").length === 19 &&
  bank.questions.filter((q) => q.finale).length === 10 &&
  bank.questions.filter((q) => q.kind === "text").length === 30);
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
check("health reports bankQuestions 119", h.body.bankQuestions === 119, JSON.stringify(h.body));

const t1 = await api("/api/today");
const t2 = await api("/api/today");
check("today returns 7 questions", t1.body.questions?.length === 7);
check("today is frozen (two calls identical)", JSON.stringify(t1.body.questions) === JSON.stringify(t2.body.questions));
check("today has no answers leaked", !t1.raw.includes('"answer":') && !t1.raw.includes("textAnswer"));

const home = await fetch(BASE + "/");
const homeText = await home.text();
check("served index.html carries new tagline, old tagline gone",
  homeText.includes("How well do you know people?") && !homeText.includes("what do people usually do?"));

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
for (let attempt = 0; attempt < 6 && !hundredthsOk; attempt++) {
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

// Yesterday peek
const y = await api("/api/yesterday");
check("yesterday returns 7 rounds with answers", y.body.rounds?.length === 7 && y.body.rounds.every((r) => r.answer !== undefined && r.answer !== null));
check("yesterday peek still shows the text #1 (out of scope, unchanged)",
  y.body.rounds.filter((r) => typeof r.answer === "string").length === 2);

child.kill();
try { fs.unlinkSync(TMP); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
