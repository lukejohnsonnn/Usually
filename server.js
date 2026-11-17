// Usually — standalone server. Express + Postgres (Render) or JSON file (local dev).
// Answers live server-side only. Daily sets freeze lazily on first load each ET day.
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore, loadBank } from "./db.js";
import {
  scoreGuess, scoreText, validateGuess, matchTextAnswer, normalizeText,
  etDateStr, addDays, seededShuffle, composeSet, deriveVotePrompt,
} from "./lib/game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const bankFile = loadBank();
const BANK = bankFile.questions;
const byId = new Map(BANK.map((q) => [q.id, q]));

const store = await createStore();
await store.seedBank(bankFile);

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "client")));

// Light abuse guard for the free tier.
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (arr.length > 200) return res.status(429).json({ ok: false, error: "Slow down." });
  next();
});

function validPlayerId(p) {
  return typeof p === "string" && p.length >= 8 && p.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(p);
}

/** Public shape of a question — never includes the answer. */
function pub(q) {
  return {
    id: q.id, kind: q.kind, category: q.category, text: q.text,
    leftLabel: q.leftLabel || null, rightLabel: q.rightLabel || null, finale: !!q.finale,
  };
}

async function liveQuestion(q) {
  // The stored answer may have flipped to the live vote % after 10 votes.
  const live = await store.getLiveAnswer(q.id);
  return { ...q, answer: live ?? q.answer };
}

async function ensureDailySet(date) {
  const existing = await store.getDailySet(date);
  if (existing) return existing;
  const ids = composeSet(BANK, `daily:${date}`);
  return store.saveDailySet(date, ids);
}

async function snapshotFor(ids) {
  const snap = [];
  for (const id of ids) {
    const q = await liveQuestion(byId.get(id));
    snap.push({
      id: q.id, kind: q.kind, answer: q.answer,
      textAnswers: q.textAnswers || null, unlisted: q.unlisted || null, top1: q.top1 || null,
    });
  }
  return snap;
}

function newPlay(playerId, mode, playDate, ids, snapshot) {
  return {
    id: crypto.randomUUID(), playerId, mode, playDate,
    questionIds: ids, snapshot, results: [], score: 0, completed: false,
  };
}

// ------------------------------------------------------------------ health
app.get("/health", async (req, res) => {
  try {
    const h = await store.health();
    res.json({ ok: true, db: h.db, bankQuestions: h.bankQuestions, date: etDateStr() });
  } catch (e) {
    res.status(500).json({ ok: false, db: "error", error: String(e.message || e) });
  }
});

// ------------------------------------------------------------- today / daily
app.get("/api/today", async (req, res) => {
  const date = etDateStr();
  const ids = await ensureDailySet(date);
  res.json({ date, questions: ids.map((id) => pub(byId.get(id))) });
});

app.post("/api/play", async (req, res) => {
  const { playerId, mode } = req.body || {};
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  if (mode !== "daily" && mode !== "endless") return res.status(400).json({ ok: false, error: "mode must be daily or endless." });
  const date = etDateStr();
  if (mode === "daily") {
    const existing = await store.getDailyPlay(playerId, date);
    if (existing) return res.json({ ok: true, ...playView(existing) });
    const ids = await ensureDailySet(date);
    const play = newPlay(playerId, "daily", date, ids, await snapshotFor(ids));
    await store.createPlay(play);
    return res.json({ ok: true, ...playView(play) });
  }
  const ids = composeSet(BANK, `endless:${playerId}:${Date.now()}:${crypto.randomUUID()}`);
  const play = newPlay(playerId, "endless", date, ids, await snapshotFor(ids));
  await store.createPlay(play);
  res.json({ ok: true, ...playView(play) });
});

function playView(play) {
  return {
    playId: play.id, mode: play.mode, playDate: play.playDate,
    questions: play.questionIds.map((id) => pub(byId.get(id))),
    results: play.results, score: play.score, completed: play.completed,
    currentRound: play.results.length,
  };
}

app.post("/api/play/:id/submit", async (req, res) => {
  const { playerId, roundIndex, guess, answer } = req.body || {};
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const play = await store.getPlay(req.params.id);
  if (!play || play.playerId !== playerId) return res.status(404).json({ ok: false, error: "Play not found." });
  if (play.completed) return res.status(400).json({ ok: false, error: "This play is already finished." });
  if (roundIndex !== play.results.length) return res.status(400).json({ ok: false, error: "That round is already locked in." });
  const q = play.snapshot[roundIndex];
  if (!q) return res.status(400).json({ ok: false, error: "Bad round." });

  let result;
  if (q.kind === "text") {
    const submitted = typeof answer === "string" ? answer : "";
    const blank = normalizeText(submitted) === "";
    const m = blank ? { rank: null } : matchTextAnswer(q, submitted);
    const s = scoreText(m.rank, blank);
    result = {
      kind: "text", questionId: q.id, textGuess: submitted, textRank: m.rank,
      points: s.points, tier: s.tier,
    };
  } else {
    const err = validateGuess(guess);
    if (err) return res.status(400).json({ ok: false, error: err });
    const s = scoreGuess(q.answer, guess);
    result = {
      kind: q.kind, questionId: q.id, guess: Number(guess), answer: q.answer,
      points: s.points, tier: s.tier, diff: s.diff,
      note: byId.get(q.id).note || null,
    };
  }
  play.results.push(result);
  play.score += result.points;
  if (play.results.length >= play.questionIds.length) play.completed = true;
  await store.updatePlay(play);
  res.json({ ok: true, result, score: play.score, currentRound: play.results.length, completed: play.completed });
});

app.get("/api/results", async (req, res) => {
  const { playerId, date } = req.query;
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const play = await store.getDailyPlay(playerId, date || etDateStr());
  if (!play) return res.json({ ok: true, completed: false, results: [], score: 0 });
  res.json({ ok: true, ...playView(play) });
});

// ------------------------------------------------------------------- stats
app.get("/api/stats", async (req, res) => {
  const { playerId } = req.query;
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const daily = await store.listCompletedDaily(playerId);
  const all = await store.listCompletedPlays(playerId);
  const dates = [...new Set(daily.map((p) => p.playDate))].sort();
  let streak = 0;
  let cursor = etDateStr();
  const dateSet = new Set(dates);
  // Streak counts back from today; if today isn't played yet, start from yesterday.
  if (!dateSet.has(cursor)) cursor = addDays(cursor, -1);
  while (dateSet.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const scores = daily.map((p) => p.score);
  res.json({
    ok: true,
    gamesPlayed: all.length,
    daysPlayed: dates.length,
    streak,
    bestScore: scores.length ? Math.max(...scores) : 0,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
  });
});

// --------------------------------------------------------------- yesterday
app.get("/api/yesterday", async (req, res) => {
  const date = addDays(etDateStr(), -1);
  const ids = await ensureDailySet(date);
  const rounds = [];
  for (const id of ids) {
    const q = await liveQuestion(byId.get(id));
    rounds.push({ ...pub(q), answer: q.kind === "text" ? q.top1 : q.answer, note: q.note || null });
  }
  res.json({ ok: true, date, rounds });
});

// -------------------------------------------------------------- contribute
const EMBARGO_DAYS = 7;

async function embargoedIds(today) {
  const ids = new Set();
  for (let i = 0; i <= EMBARGO_DAYS; i++) {
    const set = await ensureDailySet(addDays(today, i));
    for (const id of set) ids.add(id);
  }
  return ids;
}

app.get("/api/contribute", async (req, res) => {
  const { playerId } = req.query;
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const today = etDateStr();
  const daily = await store.getDailyPlay(playerId, today);
  const votablePool = BANK.filter((q) => q.votable);
  if (!daily || !daily.completed) {
    return res.json({
      ok: true, unlocked: false,
      reason: "Finish today's 7 rounds first — then your votes can't be spoiled by seeing questions early.",
      questions: [], votableTotal: votablePool.length, votedCount: (await store.votedIds(playerId)).length,
    });
  }
  const voted = new Set(await store.votedIds(playerId));
  const blocked = await embargoedIds(today);
  const available = votablePool.filter((q) => !voted.has(q.id) && !blocked.has(q.id));
  const ordered = seededShuffle(available, `contribute:${playerId}:${today}`);
  const questions = ordered.slice(0, 6).map((q) => ({ ...pub(q), votePrompt: deriveVotePrompt(q) }));
  res.json({ ok: true, unlocked: true, reason: null, questions, votableTotal: votablePool.length, votedCount: voted.size });
});

app.post("/api/contribute/vote", async (req, res) => {
  const { playerId, questionId, vote } = req.body || {};
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const q = byId.get(Number(questionId));
  if (!q || !q.votable) return res.json({ ok: false, error: "That question can't be voted on." });
  const today = etDateStr();
  const daily = await store.getDailyPlay(playerId, today);
  if (!daily || !daily.completed) return res.json({ ok: false, error: "Finish today's daily first." });
  const blocked = await embargoedIds(today);
  if (blocked.has(q.id)) return res.json({ ok: false, error: "That question is in an upcoming daily — try again later." });
  const want = q.kind === "split" ? ["left", "right"] : ["yes", "no"];
  if (!want.includes(vote)) return res.json({ ok: false, error: "Bad vote." });
  const r = await store.castVote(playerId, q.id, vote);
  if (!r.ok) return res.json({ ok: false, error: r.error });
  // After 10 real votes, the stored answer becomes the live vote % (never shown).
  if (r.total >= 10) {
    const s = await store.getQStats(q.id);
    const live = q.kind === "split"
      ? Math.round((s.left / s.total) * 100)
      : Math.round((s.yes / s.total) * 100);
    await store.setLiveAnswer(q.id, live);
  }
  res.json({ ok: true });
});

// ------------------------------------------------------------------- share
const TIER_EMOJI = { Bullseye: "🎯", "Dead On": "✅", "Razor Close": "🔥", Close: "🙂", Warm: "😐", Lukewarm: "😬", Cold: "🥶", "Way Off": "❌", Blank: "⬜" };

app.get("/api/share", async (req, res) => {
  const { playerId, date } = req.query;
  if (!validPlayerId(playerId)) return res.status(400).json({ ok: false, error: "Missing playerId." });
  const play = await store.getDailyPlay(playerId, date || etDateStr());
  if (!play || !play.completed) return res.json({ ok: false, error: "Finish today's daily first." });
  const lines = play.results.map((r) => TIER_EMOJI[r.tier] || "⬜").join("");
  res.json({ ok: true, text: `Usually ${play.playDate}\n${lines}\n${play.score}/1225` });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Usually listening on ${PORT} (store: ${store.kind}, bank: ${BANK.length} questions)`);
});
