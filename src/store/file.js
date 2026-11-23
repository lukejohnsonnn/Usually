// Local development store: everything in memory, persisted to a JSON file.
// Same async interface as the Postgres store. Pass path=null for a pure
// in-memory store (tests).
import fs from "node:fs";
import path from "node:path";

const clone = (v) => (v == null ? v : structuredClone(v));

export function createFileStore(filePath) {
  let state = { dailySets: {}, plays: {} };
  let writeTimer = null;

  function load() {
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      state = { dailySets: parsed.dailySets || {}, plays: parsed.plays || {} };
    } catch (err) {
      console.error(`[store] could not read ${filePath}, starting empty:`, err.message);
    }
  }

  function persist() {
    if (!filePath) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flush, 50);
  }

  function flush() {
    if (!filePath) return;
    clearTimeout(writeTimer);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, filePath);
  }

  return {
    kind: "file",
    async init() { load(); },
    async close() { flush(); },
    async ping() { return true; },

    async getDailySet(date) { return clone(state.dailySets[date]) || null; },
    /** Insert if absent (first writer wins) unless replace is set. Returns the stored set. */
    async putDailySet(date, ids, { replace = false } = {}) {
      if (replace || !state.dailySets[date]) {
        state.dailySets[date] = { date, ids: [...ids], createdAt: new Date().toISOString() };
        persist();
      }
      return clone(state.dailySets[date]);
    },

    async getPlay(id) { return clone(state.plays[id]) || null; },
    /** A player's play of a day, as its Daily (mode "daily") or as a Past game (mode "archive"). */
    async findDailyPlay(playerId, date, mode = "daily") {
      const p = Object.values(state.plays).find((x) => x.mode === mode && x.playerId === playerId && x.date === date);
      return clone(p) || null;
    },
    /** Creates the play; one per player per day and mode — returns the existing one if there is one. */
    async createPlay(play) {
      if (play.mode === "daily" || play.mode === "archive" || play.mode === "hunt") {
        const existing = await this.findDailyPlay(play.playerId, play.date, play.mode);
        if (existing) return existing;
      }
      state.plays[play.id] = clone(play);
      persist();
      return clone(play);
    },
    async savePlay(play) {
      state.plays[play.id] = clone(play);
      persist();
    },
    async deletePlays(ids) {
      for (const id of ids) delete state.plays[id];
      persist();
    },
    async dailyPlaysInProgress(date) {
      return Object.values(state.plays)
        .filter((p) => p.mode === "daily" && p.date === date && !p.completedAt)
        .map((p) => ({ id: p.id, questionIds: [...p.questionIds] }));
    },
    /** Ids of every Daily play (finished or not) for a date. */
    async dailyPlayIds(date) {
      return Object.values(state.plays).filter((p) => p.mode === "daily" && p.date === date).map((p) => p.id);
    },
    /** Dates that have a frozen Daily set. */
    async dailySetDates() { return Object.keys(state.dailySets); },
    /** Every question id used by a Daily other than the given date. */
    async usedDailyIds(exceptDate) {
      const used = new Set();
      for (const [date, set] of Object.entries(state.dailySets)) if (date !== exceptDate) for (const id of set.ids) used.add(id);
      return used;
    },
    /** All of one player's plays, lightweight rows for the Past games list. */
    async playerPlays(playerId) {
      return Object.values(state.plays)
        .filter((p) => p.playerId === playerId)
        .map((p) => ({ mode: p.mode, date: p.date, score: p.score, completed: Boolean(p.completedAt) }));
    },
    /** Finished games, ever: every completed Daily and Past game (not Hive Hunts). */
    async gamesPlayed() {
      return Object.values(state.plays).filter((p) => (p.mode === "daily" || p.mode === "archive") && p.completedAt).length;
    },
    /** Every finished Daily score for a date (not Past-game replays). */
    async dailyScores(date) {
      return Object.values(state.plays).filter((p) => p.mode === "daily" && p.date === date && p.completedAt).map((p) => p.score);
    },
    /** Completed plays for one player, lightweight rows for stats. */
    async completedPlays(playerId) {
      return Object.values(state.plays)
        .filter((p) => p.playerId === playerId && p.completedAt)
        .map((p) => ({ mode: p.mode, date: p.date, score: p.score }));
    },
    flush,
  };
}
