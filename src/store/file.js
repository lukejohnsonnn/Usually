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
    async findDailyPlay(playerId, date) {
      const p = Object.values(state.plays).find((x) => x.mode === "daily" && x.playerId === playerId && x.date === date);
      return clone(p) || null;
    },
    /** Creates the play; for a Daily, returns the existing one if the player already has it. */
    async createPlay(play) {
      if (play.mode === "daily") {
        const existing = await this.findDailyPlay(play.playerId, play.date);
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
    /** Completed plays for one player, lightweight rows for stats. */
    async completedPlays(playerId) {
      return Object.values(state.plays)
        .filter((p) => p.playerId === playerId && p.completedAt)
        .map((p) => ({ mode: p.mode, date: p.date, score: p.score }));
    },
    flush,
  };
}
