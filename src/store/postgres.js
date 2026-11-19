// Production store: Postgres. Same async interface as the file store.
import pg from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hd_daily_sets (
  date        TEXT PRIMARY KEY,
  ids         JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hd_plays (
  id            TEXT PRIMARY KEY,
  player_id     TEXT NOT NULL,
  mode          TEXT NOT NULL,
  daily_key     TEXT UNIQUE,
  date          TEXT NOT NULL,
  question_ids  JSONB NOT NULL,
  snapshot      JSONB NOT NULL,
  results       JSONB NOT NULL,
  score         INTEGER NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hd_plays_player ON hd_plays (player_id);
`;

function rowToPlay(r) {
  if (!r) return null;
  return {
    id: r.id,
    playerId: r.player_id,
    mode: r.mode,
    date: r.date,
    questionIds: r.question_ids,
    snapshot: r.snapshot,
    results: r.results,
    score: r.score,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

export function createPostgresStore(connectionString, { Pool = pg.Pool } = {}) {
  const local = /localhost|127\.0\.0\.1/.test(connectionString || "");
  const pool = new Pool({
    connectionString,
    ssl: local || !connectionString ? false : { rejectUnauthorized: false },
    max: 5,
  });
  pool.on?.("error", (err) => console.error("[pg] idle client error:", err.message));
  const q = (text, params) => pool.query(text, params);
  const j = (v) => JSON.stringify(v);

  return {
    kind: "postgres",
    async init() { await q(SCHEMA); },
    async close() { await pool.end(); },
    async ping() { await q("SELECT 1"); return true; },

    async getDailySet(date) {
      const { rows } = await q("SELECT date, ids FROM hd_daily_sets WHERE date = $1", [date]);
      return rows[0] ? { date: rows[0].date, ids: rows[0].ids } : null;
    },
    async putDailySet(date, ids, { replace = false } = {}) {
      if (replace) {
        await q(`INSERT INTO hd_daily_sets (date, ids) VALUES ($1, $2)
                 ON CONFLICT (date) DO UPDATE SET ids = EXCLUDED.ids, created_at = now()`, [date, j(ids)]);
      } else {
        await q("INSERT INTO hd_daily_sets (date, ids) VALUES ($1, $2) ON CONFLICT (date) DO NOTHING", [date, j(ids)]);
      }
      return this.getDailySet(date);
    },

    async getPlay(id) {
      const { rows } = await q("SELECT * FROM hd_plays WHERE id = $1", [id]);
      return rowToPlay(rows[0]);
    },
    async findDailyPlay(playerId, date) {
      const { rows } = await q("SELECT * FROM hd_plays WHERE mode = 'daily' AND player_id = $1 AND date = $2", [playerId, date]);
      return rowToPlay(rows[0]);
    },
    async createPlay(p) {
      // daily_key enforces one Daily per player per day (NULL for Endless plays).
      const dailyKey = p.mode === "daily" ? `${p.playerId}|${p.date}` : null;
      await q(`INSERT INTO hd_plays (id, player_id, mode, daily_key, date, question_ids, snapshot, results, score)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [p.id, p.playerId, p.mode, dailyKey, p.date, j(p.questionIds), j(p.snapshot), j(p.results), p.score]);
      return p.mode === "daily" ? this.findDailyPlay(p.playerId, p.date) : this.getPlay(p.id);
    },
    async savePlay(p) {
      await q("UPDATE hd_plays SET results = $2, score = $3, completed_at = $4 WHERE id = $1",
        [p.id, j(p.results), p.score, p.completedAt]);
    },
    async deletePlays(ids) {
      if (!ids.length) return;
      const params = ids.map((_, i) => `$${i + 1}`).join(",");
      await q(`DELETE FROM hd_plays WHERE id IN (${params})`, ids);
    },
    async dailyPlaysInProgress(date) {
      const { rows } = await q("SELECT id, question_ids FROM hd_plays WHERE mode = 'daily' AND date = $1 AND completed_at IS NULL", [date]);
      return rows.map((r) => ({ id: r.id, questionIds: r.question_ids }));
    },
    async completedPlays(playerId) {
      const { rows } = await q("SELECT mode, date, score FROM hd_plays WHERE player_id = $1 AND completed_at IS NOT NULL", [playerId]);
      return rows.map((r) => ({ mode: r.mode, date: r.date, score: r.score }));
    },
  };
}
