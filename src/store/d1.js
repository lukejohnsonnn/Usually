// Production store: Cloudflare D1 (SQLite). Same async interface as the
// file store. The schema is created on first use, so a fresh database needs
// no manual migration step (migrations/0001_init.sql holds the same SQL).

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hd_daily_sets (
     date        TEXT PRIMARY KEY,
     ids         TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE TABLE IF NOT EXISTS hd_plays (
     id            TEXT PRIMARY KEY,
     player_id     TEXT NOT NULL,
     mode          TEXT NOT NULL,
     daily_key     TEXT UNIQUE,
     date          TEXT NOT NULL,
     question_ids  TEXT NOT NULL,
     snapshot      TEXT NOT NULL,
     results       TEXT NOT NULL,
     score         INTEGER NOT NULL DEFAULT 0,
     completed_at  TEXT,
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   )`,
  `CREATE INDEX IF NOT EXISTS hd_plays_player ON hd_plays (player_id)`,
  `CREATE INDEX IF NOT EXISTS hd_plays_date ON hd_plays (date, mode)`,
];

function rowToPlay(r) {
  if (!r) return null;
  return {
    id: r.id,
    playerId: r.player_id,
    mode: r.mode,
    date: r.date,
    questionIds: JSON.parse(r.question_ids),
    snapshot: JSON.parse(r.snapshot),
    results: JSON.parse(r.results),
    score: r.score,
    completedAt: r.completed_at || null,
    createdAt: r.created_at || null,
  };
}

/** @param {D1Database} db */
export function createD1Store(db) {
  let ready = null;
  const init = () => (ready ||= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => { ready = null; throw err; }));
  const run = async (sql, ...params) => { await init(); return db.prepare(sql).bind(...params); };
  const first = async (sql, ...params) => (await run(sql, ...params)).first();
  const all = async (sql, ...params) => (await (await run(sql, ...params)).all()).results;
  const exec = async (sql, ...params) => (await run(sql, ...params)).run();
  const j = (v) => JSON.stringify(v);

  return {
    kind: "d1",
    async init() { await init(); },
    async close() {},
    async ping() { await first("SELECT 1 AS ok"); return true; },

    async getDailySet(date) {
      const r = await first("SELECT date, ids FROM hd_daily_sets WHERE date = ?", date);
      return r ? { date: r.date, ids: JSON.parse(r.ids) } : null;
    },
    /** Insert if absent (first writer wins) unless replace is set. Returns the stored set. */
    async putDailySet(date, ids, { replace = false } = {}) {
      if (replace) {
        await exec(`INSERT INTO hd_daily_sets (date, ids) VALUES (?, ?)
                    ON CONFLICT (date) DO UPDATE SET ids = excluded.ids`, date, j(ids));
      } else {
        await exec("INSERT INTO hd_daily_sets (date, ids) VALUES (?, ?) ON CONFLICT (date) DO NOTHING", date, j(ids));
      }
      return this.getDailySet(date);
    },

    async getPlay(id) { return rowToPlay(await first("SELECT * FROM hd_plays WHERE id = ?", id)); },
    /** A player's play of a day, as its Daily (mode "daily") or as a Past game (mode "archive"). */
    async findDailyPlay(playerId, date, mode = "daily") {
      return rowToPlay(await first("SELECT * FROM hd_plays WHERE mode = ? AND player_id = ? AND date = ?", mode, playerId, date));
    },
    /** Creates the play; for a Daily, returns the existing one if the player already has it. */
    async createPlay(p) {
      // daily_key enforces one play per player per day and mode (NULL for old Endless plays).
      const dailyKey = p.mode === "daily" ? `${p.playerId}|${p.date}` : p.mode === "archive" || p.mode === "hunt" ? `${p.mode}|${p.playerId}|${p.date}` : null;
      await exec(`INSERT INTO hd_plays (id, player_id, mode, daily_key, date, question_ids, snapshot, results, score, completed_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      p.id, p.playerId, p.mode, dailyKey, p.date, j(p.questionIds), j(p.snapshot), j(p.results), p.score, p.completedAt ?? null);
      return p.mode === "daily" || p.mode === "archive" || p.mode === "hunt" ? this.findDailyPlay(p.playerId, p.date, p.mode) : this.getPlay(p.id);
    },
    async savePlay(p) {
      await exec("UPDATE hd_plays SET results = ?, score = ?, completed_at = ?, question_ids = ?, snapshot = ? WHERE id = ?",
        j(p.results), p.score, p.completedAt ?? null, j(p.questionIds), j(p.snapshot), p.id);
    },
    async deletePlays(ids) {
      if (!ids.length) return;
      await exec(`DELETE FROM hd_plays WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
    },
    async dailyPlaysInProgress(date) {
      const rows = await all("SELECT id, question_ids FROM hd_plays WHERE mode = 'daily' AND date = ? AND completed_at IS NULL", date);
      return rows.map((r) => ({ id: r.id, questionIds: JSON.parse(r.question_ids) }));
    },
    async dailyPlayIds(date) {
      return (await all("SELECT id FROM hd_plays WHERE mode = 'daily' AND date = ?", date)).map((r) => r.id);
    },
    async dailySetDates() {
      return (await all("SELECT date FROM hd_daily_sets")).map((r) => r.date);
    },
    async usedDailyIds(exceptDate) {
      const used = new Set();
      for (const r of await all("SELECT ids FROM hd_daily_sets WHERE date <> ?", exceptDate ?? "")) for (const id of JSON.parse(r.ids)) used.add(id);
      return used;
    },
    async playerPlays(playerId) {
      const rows = await all("SELECT mode, date, score, completed_at FROM hd_plays WHERE player_id = ?", playerId);
      return rows.map((r) => ({ mode: r.mode, date: r.date, score: r.score, completed: Boolean(r.completed_at) }));
    },
    /** Every finished Daily score for a date (not Past-game replays). */
    async dailyScores(date) {
      return (await all("SELECT score FROM hd_plays WHERE mode = 'daily' AND date = ? AND completed_at IS NOT NULL", date)).map((r) => r.score);
    },
    async completedPlays(playerId) {
      return all("SELECT mode, date, score FROM hd_plays WHERE player_id = ? AND completed_at IS NOT NULL", playerId);
    },
  };
}
