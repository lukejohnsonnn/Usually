// Honeydle game service: the Daily freeze (with self-heal), plays,
// submit-and-score, stats, yesterday and share. No HTTP here.
import crypto from "node:crypto";
import fs from "node:fs";
import {
  ROUNDS, MAX_SCORE, composeSet, isValidSet, publicQuestion, poolOf,
  validateGuess, cleanGuess, scoreNumeric, scoreRank,
  matchTextAnswer, normalizeText, easternDate, addDays, shareText,
} from "./game/index.js";

export class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Load and sanity-check the bank. Bad records are skipped loudly, never fatal. */
export function loadBank(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.questions;
  const seen = new Set();
  const bank = [];
  for (const q of list) {
    const problem = bankProblem(q, seen);
    if (problem) { console.warn(`[bank] skipping question ${q?.id}: ${problem}`); continue; }
    seen.add(q.id);
    bank.push(Object.freeze(q));
  }
  return bank;
}

function bankProblem(q, seen) {
  if (!q || !Number.isInteger(q.id)) return "missing numeric id";
  if (seen.has(q.id)) return "duplicate id";
  if (!["guess", "text"].includes(q.kind)) return `unknown kind ${q.kind}`;
  if (!q.text || !q.category) return "missing text or category";
  if (q.kind === "guess") {
    if (validateGuess(q.answer)) return `bad answer ${q.answer}`;
  }
  if (q.kind === "text") {
    if (!Array.isArray(q.textAnswers) || q.textAnswers.length < 10) return "text round without a ranked list";
    if (!q.top1) return "text round without a #1 label";
  }
  if (q.kind !== "guess" && q.finale) return "only guess questions can be finales";
  return null;
}

const newId = (prefix) => `${prefix}${crypto.randomBytes(9).toString("base64url")}`;

export function createService({ store, bank, now = () => new Date() }) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const locks = new Map();
  const today = () => easternDate(now());

  /** Serialise work per key inside this process (the DB handles cross-process races). */
  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    locks.set(key, next);
    next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
    return next;
  }

  /**
   * The Daily freeze. First request of an Eastern day composes and stores
   * the set; a healthy frozen set is never rewritten. A missing, short,
   * duplicated or stale set is recomposed, and in-progress Daily plays built
   * from the broken set are discarded so those players get a full game.
   */
  async function ensureDailySet(date) {
    const existing = await store.getDailySet(date);
    if (existing && isValidSet(existing.ids, bank)) return existing.ids;
    return withLock(`daily:${date}`, async () => {
      const again = await store.getDailySet(date);
      if (again && isValidSet(again.ids, bank)) return again.ids;
      const ids = composeSet(bank, `daily:${date}`);
      const stored = await store.putDailySet(date, ids, { replace: Boolean(again) });
      if (!isValidSet(stored.ids, bank)) throw new Error(`daily set for ${date} failed validation after save`);
      if (again) {
        console.warn(`[heal] daily set ${date} was malformed (${JSON.stringify(again.ids)}), recomposed`);
        const stale = (await store.dailyPlaysInProgress(date))
          .filter((p) => JSON.stringify(p.questionIds) !== JSON.stringify(stored.ids));
        if (stale.length) {
          await store.deletePlays(stale.map((p) => p.id));
          console.warn(`[heal] discarded ${stale.length} in-progress play(s) for ${date}`);
        }
      }
      return stored.ids;
    });
  }

  function playView(play) {
    return {
      id: play.id,
      mode: play.mode,
      date: play.date,
      round: play.results.length,
      rounds: ROUNDS,
      score: play.score,
      maxScore: MAX_SCORE,
      completed: Boolean(play.completedAt),
      questions: play.snapshot.map(publicQuestion),
      results: play.results,
    };
  }

  async function startPlay(playerId, mode) {
    if (mode !== "daily" && mode !== "endless") throw new GameError(400, "mode must be daily or endless");
    const date = today();
    let ids;
    if (mode === "daily") {
      ids = await ensureDailySet(date);
      const existing = await store.findDailyPlay(playerId, date);
      if (existing) return playView(existing);
    } else {
      ids = composeSet(bank, `endless:${crypto.randomUUID()}`);
    }
    const play = {
      id: newId("p-"),
      playerId,
      mode,
      date,
      questionIds: ids,
      snapshot: ids.map((id) => byId.get(id)), // answers frozen into the play, server-side only
      results: [],
      score: 0,
      completedAt: null,
    };
    return playView(await store.createPlay(play));
  }

  function scoreRound(q, value) {
    const kind = poolOf(q);
    if (kind === "text") {
      const typed = typeof value === "string" ? value.slice(0, 120) : "";
      const m = matchTextAnswer(q, typed);
      const s = scoreRank(m.rank, Boolean(m.blank) || !normalizeText(typed));
      const out = { kind, guess: typed.trim(), points: s.points, tier: s.tier, rank: s.rank };
      // Read-back of an autocorrected partial — never for #1 (the #1 label never leaves the server).
      if (m.autocorrected && s.rank != null && s.rank >= 2) out.readBack = m.matched;
      return out;
    }
    const err = validateGuess(value);
    if (err) throw new GameError(400, err);
    const guess = cleanGuess(value);
    const s = scoreNumeric(q.answer, guess);
    const out = { kind, guess, answer: q.answer, points: s.points, tier: s.tier, diff: s.diff };
    if (q.note) out.note = q.note;
    return out;
  }

  async function submit(playerId, playId, { round, value } = {}) {
    return withLock(`play:${playId}`, async () => {
      const play = await store.getPlay(playId);
      if (!play || play.playerId !== playerId) throw new GameError(404, "Play not found.");
      if (play.completedAt) throw new GameError(409, "This run is finished.");
      const next = play.results.length;
      if (round !== next) throw new GameError(409, `Round ${round + 1} is not the next unanswered round.`);
      const q = play.snapshot[next];
      const result = { round: next, questionId: q.id, ...scoreRound(q, value) };
      play.results.push(result);
      play.score = play.results.reduce((a, r) => a + r.points, 0);
      if (play.results.length === ROUNDS) play.completedAt = now().toISOString();
      await store.savePlay(play);
      return { result, play: playView(play) };
    });
  }

  async function dailyResults(playerId, date = today()) {
    const play = await store.findDailyPlay(playerId, date);
    return play ? playView(play) : null;
  }

  async function stats(playerId) {
    const plays = await store.completedPlays(playerId);
    const daily = plays.filter((p) => p.mode === "daily");
    const days = new Set(daily.map((p) => p.date));
    const t = today();
    let cursor = days.has(t) ? t : addDays(t, -1);
    let streak = 0;
    while (days.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
    const scores = daily.map((p) => p.score);
    return {
      streak,
      games: plays.length,
      best: scores.length ? Math.max(...scores) : null,
      avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  }

  /** The only answer-publishing view: yesterday's set with real answers and text #1s. */
  async function yesterday() {
    const date = addDays(today(), -1);
    const ids = await ensureDailySet(date);
    return {
      date,
      rounds: ids.map((id) => {
        const q = byId.get(id);
        const base = publicQuestion(q);
        if (q.kind === "text") return { ...base, top1: q.top1 };
        return { ...base, answer: q.answer, note: q.note || null, source: q.source || null, sourceUrl: q.sourceUrl || null };
      }),
    };
  }

  async function share(playerId, date = today()) {
    const play = await store.findDailyPlay(playerId, date);
    if (!play || !play.completedAt) throw new GameError(404, "Finish the Daily to share it.");
    return { text: shareText(date, play.results, play.score), score: play.score };
  }

  async function todaySet() {
    const date = today();
    const ids = await ensureDailySet(date);
    return { date, rounds: ROUNDS, maxScore: MAX_SCORE, questions: ids.map((id) => publicQuestion(byId.get(id))) };
  }

  return { ensureDailySet, startPlay, submit, dailyResults, stats, yesterday, share, todaySet, today, bankSize: bank.length };
}
