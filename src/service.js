// Honeydle game service: the Daily freeze (with self-heal), plays,
// submit-and-score, stats, yesterday and share. No HTTP here.
import {
  ROUNDS, MAX_SCORE, composeSet, isValidSet, publicQuestion, poolOf,
  validateGuess, cleanGuess, scoreNumeric, scoreRank,
  matchTextAnswer, normalizeText, easternDate, addDays, shareText, isDateStr, FIRST_DAILY, dayNumber,
} from "./game/index.js";

// Runtime-neutral: runs unchanged on Node (local dev, tests) and Cloudflare
// Workers. No file system, no Node-only crypto.

export class GameError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/** The display label for a rank of a text question. */
const labelOf = (q, rank) => q.textAnswers.find((s) => s.rank === rank)?.texts[0] ?? null;

/** Sanity-check the bank (the parsed bank.json). Bad records are skipped loudly, never fatal. */
export function prepareBank(raw) {
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
    if (!Array.isArray(q.textAnswers) || q.textAnswers.length < 5) return "text round without a ranked list";
    if (!q.top1) return "text round without a #1 label";
  }
  if (q.kind !== "guess" && q.finale) return "only guess questions can be finales";
  return null;
}

function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Hand-picked Daily overrides (the parsed daily-overrides.json):
 * [{ date, ids, resetPlays }]. An override pins a date's set; with
 * resetPlays, every Daily play of that date is cleared once, the first time
 * the override is applied, so the day can be replayed. Invalid entries are
 * skipped loudly, never fatal.
 */
export function prepareOverrides(list, bank) {
  return (Array.isArray(list) ? list : []).filter((o) => {
    const ok = o && isDateStr(o.date) && isValidSet(o.ids, bank);
    if (!ok) console.warn(`[overrides] skipping invalid override ${JSON.stringify(o)}`);
    return ok;
  });
}

const sameIds = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createService({ store, bank, now = () => new Date(), overrides = [] }) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const pinned = new Map(overrides.filter((o) => isValidSet(o.ids, bank)).map((o) => [o.date, o]));
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
    const pin = pinned.get(date);
    const healthy = (set) => set && isValidSet(set.ids, bank) && (!pin || sameIds(set.ids, pin.ids));
    const existing = await store.getDailySet(date);
    if (healthy(existing)) return existing.ids;
    return withLock(`daily:${date}`, async () => {
      const again = await store.getDailySet(date);
      if (healthy(again)) return again.ids;
      if (pin) return applyPin(date, pin, again);
      const ids = await composeFresh(date);
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

  /**
   * A new Daily never repeats a question from an earlier Daily (Past games
   * make every earlier one playable), and prefers questions nobody has seen
   * yet. It only falls back when a pool runs dry, so the game never stops.
   */
  async function composeFresh(date) {
    const used = await store.usedDailyIds(date);
    for (const [d, pin] of pinned) if (d !== date) for (const id of pin.ids) used.add(id); // hand-picked days count as used
    const active = bank.filter((q) => !q.retired);
    const tiers = [
      active.filter((q) => !used.has(q.id) && !q.exposed),
      active.filter((q) => !used.has(q.id) && q.exposed),
      active.filter((q) => used.has(q.id)),
    ];
    const need = { guess: 4, text: 2, finale: 1 };
    const pool = [];
    for (const kind of Object.keys(need)) {
      let have = 0;
      for (const [i, tier] of tiers.entries()) {
        if (have >= need[kind]) break;
        const add = tier.filter((q) => poolOf(q) === kind);
        if (i > 0 && add.length) console.warn(`[daily] ${date}: fresh ${kind} questions ran low, using tier ${i + 1}`);
        pool.push(...add);
        have += add.length;
      }
    }
    return composeSet(pool, `daily:${date}`);
  }

  /** Swap in a hand-picked set (runs once: afterwards the stored set matches the pin). */
  async function applyPin(date, pin, previous) {
    const stored = await store.putDailySet(date, pin.ids, { replace: Boolean(previous) });
    const plays = pin.resetPlays
      ? await store.dailyPlayIds(date)
      : (await store.dailyPlaysInProgress(date)).filter((p) => !sameIds(p.questionIds, pin.ids)).map((p) => p.id);
    if (plays.length) await store.deletePlays(plays);
    console.warn(`[override] daily ${date} pinned to ${pin.ids.join(",")}; cleared ${plays.length} play(s)`);
    return stored.ids;
  }

  function playView(play) {
    return {
      id: play.id,
      mode: play.mode,
      date: play.date,
      number: dayNumber(play.date),
      round: play.results.length,
      rounds: ROUNDS,
      score: play.score,
      maxScore: MAX_SCORE,
      completed: Boolean(play.completedAt),
      questions: play.snapshot.map(publicQuestion),
      results: play.results,
    };
  }

  /**
   * Start or resume a play. "daily" is today's set; "archive" replays an
   * earlier Daily (Past games). Each player gets one play per day: if they
   * already played a day as its Daily, that play is what they get back.
   */
  async function startPlay(playerId, mode, requestedDate) {
    if (mode === "endless") throw new GameError(400, "Endless practice is now Past games.");
    if (mode !== "daily" && mode !== "archive") throw new GameError(400, "mode must be daily or archive");
    let date = today();
    let ids;
    if (mode === "daily") {
      ids = await ensureDailySet(date);
      const existing = await store.findDailyPlay(playerId, date);
      if (existing) return playView(existing);
    } else {
      if (!isDateStr(requestedDate) || requestedDate < FIRST_DAILY || requestedDate >= today()) {
        throw new GameError(400, "Pick a past game from the list.");
      }
      date = requestedDate;
      const set = await store.getDailySet(date);
      if (!pinned.has(date) && (!set || !isValidSet(set.ids, bank))) throw new GameError(404, "That day's game isn't available.");
      ids = await ensureDailySet(date); // a hand-picked day is frozen the first time anyone opens it
      const asDaily = await store.findDailyPlay(playerId, date);
      if (asDaily) return playView(asDaily);
      const existing = await store.findDailyPlay(playerId, date, "archive");
      if (existing) return playView(existing);
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

  /**
   * Score a round. Text answers must be on the list: an exact match is
   * scored, a near miss returns { suggestion } (the client puts it in the box
   * for the player to confirm), and anything unlisted is refused without
   * using up the round. When the timer ran out, whatever was typed is scored.
   */
  function scoreRound(q, value, { timedOut = false } = {}) {
    const kind = poolOf(q);
    if (kind === "text") {
      const typed = typeof value === "string" ? value.slice(0, 120) : "";
      const blank = !normalizeText(typed);
      const m = blank ? { rank: null } : matchTextAnswer(q, typed);
      if (!timedOut) {
        if (blank) throw new GameError(400, "Type an answer first.", "blank");
        if (m.rank == null && m.ambiguous) {
          return { refused: "ambiguous", message: `Which one? More than one answer fits “${typed.trim()}” — be more specific.` };
        }
        if (m.rank == null) return { refused: "unlisted", message: "That's not on the list — try another answer." };
        if (!m.exact) return { suggestion: labelOf(q, m.rank) };
      }
      const s = scoreRank(m.rank, blank);
      const out = { kind, guess: typed.trim(), points: s.points, tier: s.tier, rank: s.rank };
      if (m.rank != null && !m.exact) out.readBack = labelOf(q, m.rank);
      out.top3 = [1, 2, 3].map((r) => labelOf(q, r)).filter(Boolean);
      if (timedOut) out.timedOut = true;
      return out;
    }
    const err = validateGuess(value);
    if (err) throw new GameError(400, err);
    const guess = cleanGuess(value);
    const s = scoreNumeric(q.answer, guess);
    const out = { kind, guess, answer: q.answer, points: s.points, tier: s.tier, diff: s.diff };
    if (q.note) out.note = q.note;
    if (timedOut) out.timedOut = true;
    return out;
  }

  async function submit(playerId, playId, { round, value, timedOut = false } = {}) {
    return withLock(`play:${playId}`, async () => {
      const play = await store.getPlay(playId);
      if (!play || play.playerId !== playerId) throw new GameError(404, "Play not found.");
      if (play.completedAt) throw new GameError(409, "This run is finished.");
      const next = play.results.length;
      if (round !== next) throw new GameError(409, `Round ${round + 1} is not the next unanswered round.`);
      const q = play.snapshot[next];
      const scored = scoreRound(q, value, { timedOut: timedOut === true });
      if (scored.suggestion !== undefined) return { suggestion: scored.suggestion }; // not scored yet
      if (scored.refused) return { refused: scored.refused, message: scored.message }; // round not used up
      const result = { round: next, questionId: q.id, ...scored };
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

  /** Past games: every earlier Daily, newest first, with this player's result. */
  async function archive(playerId) {
    const t = today();
    const dates = [...new Set([...(await store.dailySetDates()), ...pinned.keys()])]
      .filter((d) => d >= FIRST_DAILY && d < t).sort().reverse();
    const mine = new Map();
    for (const p of await store.playerPlays(playerId)) {
      if (p.mode !== "daily" && p.mode !== "archive") continue;
      const prev = mine.get(p.date);
      if (!prev || (p.completed && !prev.completed)) mine.set(p.date, p);
    }
    return {
      today: t,
      games: dates.map((date) => {
        const p = mine.get(date);
        return {
          date,
          number: dayNumber(date),
          status: !p ? "new" : p.completed ? "done" : "playing",
          score: p?.completed ? p.score : null,
          playedAs: p?.mode ?? null,
        };
      }),
    };
  }

  async function stats(playerId) {
    const plays = (await store.completedPlays(playerId)).filter((p) => p.mode === "daily" || p.mode === "archive");
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

  return { ensureDailySet, startPlay, submit, dailyResults, stats, yesterday, share, todaySet, today, archive, bankSize: bank.filter((q) => !q.retired).length };
}
