// Persistence for Usually. Two backends, one async API:
//  - Postgres (pg) when DATABASE_URL is set — the Render production path.
//  - A JSON file (data/local.json) otherwise — local dev / verification only.
// The game logic never sees which backend is active.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.resolve(__dirname, "data/bank.json");
const LOCAL_PATH = process.env.LOCAL_DATA_PATH || path.resolve(__dirname, "data/local.json");

export function loadBank() {
  return JSON.parse(fs.readFileSync(BANK_PATH, "utf8"));
}

function emptyState() {
  return { dailySets: {}, plays: {} };
}

// ---------------------------------------------------------------- file store
class FileStore {
  constructor() {
    this.kind = "file";
    try { this.state = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")); }
    catch { this.state = emptyState(); }
    // Drop any pre-audit live-answer overrides: researched answers are authoritative.
    if (this.state.overrides) { delete this.state.overrides; this.save(); }
    this.saveTimer = null;
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
      fs.writeFileSync(LOCAL_PATH, JSON.stringify(this.state, null, 2));
    }, 50);
  }
  flush() {
    clearTimeout(this.saveTimer);
    fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(this.state, null, 2));
  }
  async init() { /* nothing to create */ }
  async seedBank(bank) { this.bank = bank; return { inserted: 0, note: "file store reads bank.json directly" }; }
  async getBank() { return this.bank.questions; }
  async getDailySet(date) { return this.state.dailySets[date] || null; }
  async saveDailySet(date, ids) { this.state.dailySets[date] = ids; this.save(); return ids; }
  // Overwrite a frozen set (the self-heal path). Unlike saveDailySet, this
  // replaces an existing row — a healthy set is never passed here.
  async replaceDailySet(date, ids) { this.state.dailySets[date] = ids; this.save(); return ids; }
  // Drop daily plays built from a malformed set (their questionIds don't
  // equal the healed set) so the player gets a fresh full 7-round game.
  async deleteStaleDailyPlays(date, validIds) {
    const want = JSON.stringify(validIds);
    let dropped = 0;
    for (const [id, p] of Object.entries(this.state.plays)) {
      if (p.mode === "daily" && p.playDate === date && JSON.stringify(p.questionIds) !== want) {
        delete this.state.plays[id];
        dropped++;
      }
    }
    if (dropped) this.save();
    return dropped;
  }
  async getDailyPlay(playerId, date) {
    return Object.values(this.state.plays).find((p) => p.playerId === playerId && p.mode === "daily" && p.playDate === date) || null;
  }
  async createPlay(play) { this.state.plays[play.id] = play; this.save(); return play; }
  async updatePlay(play) { this.state.plays[play.id] = play; this.save(); return play; }
  async getPlay(id) { return this.state.plays[id] || null; }
  async listCompletedDaily(playerId) {
    return Object.values(this.state.plays).filter((p) => p.playerId === playerId && p.mode === "daily" && p.completed);
  }
  async listCompletedPlays(playerId) {
    return Object.values(this.state.plays).filter((p) => p.playerId === playerId && p.completed);
  }
  async health() { return { ok: true, db: "file", bankQuestions: this.bank.questions.length }; }
}

// -------------------------------------------------------------- postgres store
class PgStore {
  constructor(pool) { this.kind = "postgres"; this.pool = pool; }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS questions(
      id INT PRIMARY KEY, kind TEXT NOT NULL, category TEXT, text TEXT NOT NULL,
      answer NUMERIC, note TEXT, left_label TEXT, right_label TEXT,
      finale BOOLEAN NOT NULL DEFAULT FALSE, votable BOOLEAN NOT NULL DEFAULT TRUE,
      text_answers JSONB, unlisted JSONB)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS daily_sets(
      date TEXT PRIMARY KEY, question_ids INT[] NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS plays(
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL,
      play_date TEXT NOT NULL, question_ids INT[] NOT NULL, snapshot JSONB NOT NULL,
      results JSONB NOT NULL DEFAULT '[]', score INT NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS plays_player_daily ON plays(player_id, mode, play_date)`);
  }
  // bank.json is authoritative: upsert every question.
  // Questions dropped from bank.json are deleted; frozen daily sets only
  // store ids and are never rewritten here.
  async seedBank(bank) {
    let inserted = 0, updated = 0;
    const ids = bank.questions.map((q) => q.id);
    for (const q of bank.questions) {
      const cur = await this.pool.query(`SELECT answer FROM questions WHERE id=$1`, [q.id]);
      const r = await this.pool.query(
        `INSERT INTO questions(id,kind,category,text,answer,note,left_label,right_label,finale,votable,text_answers,unlisted)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind, category=EXCLUDED.category,
           text=EXCLUDED.text, answer=EXCLUDED.answer, note=EXCLUDED.note,
           left_label=EXCLUDED.left_label, right_label=EXCLUDED.right_label,
           finale=EXCLUDED.finale, votable=EXCLUDED.votable,
           text_answers=EXCLUDED.text_answers, unlisted=EXCLUDED.unlisted`,
        [q.id, q.kind, q.category, q.text, q.answer, q.note, q.leftLabel || null, q.rightLabel || null,
         q.finale, q.votable,
         q.textAnswers ? JSON.stringify(q.textAnswers) : null,
         q.unlisted ? JSON.stringify(q.unlisted) : null]);
      if (r.rowCount) { if (cur.rows[0]) updated++; else inserted++; }
    }
    const existing = await this.pool.query(`SELECT id FROM questions`);
    const keep = new Set(ids);
    const staleIds = existing.rows.map((r) => r.id).filter((id) => !keep.has(id));
    for (const id of staleIds) {
      await this.pool.query(`DELETE FROM questions WHERE id=$1`, [id]);
    }
    return { inserted, updated, staleRemoved: staleIds.length };
  }
  async getBank() {
    const r = await this.pool.query(`SELECT * FROM questions ORDER BY id`);
    return r.rows.map((row) => ({
      id: row.id, kind: row.kind, category: row.category, text: row.text,
      answer: row.answer == null ? null : Number(row.answer), note: row.note,
      leftLabel: row.left_label, rightLabel: row.right_label, finale: row.finale,
      votable: row.votable,
      textAnswers: row.text_answers || undefined, unlisted: row.unlisted || undefined,
    }));
  }
  async getDailySet(date) {
    const r = await this.pool.query(`SELECT question_ids FROM daily_sets WHERE date=$1`, [date]);
    return r.rows[0] ? r.rows[0].question_ids : null;
  }
  async saveDailySet(date, ids) {
    await this.pool.query(
      `INSERT INTO daily_sets(date, question_ids) VALUES($1,$2) ON CONFLICT (date) DO NOTHING`, [date, ids]);
    return (await this.getDailySet(date)) || ids;
  }
  // Overwrite a frozen set (the self-heal path). Upsert so a missing row is
  // created too — a pure UPDATE would silently no-op on a never-frozen date.
  async replaceDailySet(date, ids) {
    await this.pool.query(
      `INSERT INTO daily_sets(date, question_ids) VALUES($1,$2)
       ON CONFLICT (date) DO UPDATE SET question_ids=EXCLUDED.question_ids`, [date, ids]);
    return ids;
  }
  // Drop daily plays built from a malformed set (their questionIds don't
  // equal the healed set) so the player gets a fresh full 7-round game.
  // Postgres array equality is ordered and element-wise, so != is exact.
  async deleteStaleDailyPlays(date, validIds) {
    const r = await this.pool.query(
      `DELETE FROM plays WHERE mode='daily' AND play_date=$1 AND question_ids <> $2::int[]`,
      [date, validIds]);
    return r.rowCount;
  }
  async getDailyPlay(playerId, date) {
    const r = await this.pool.query(
      `SELECT * FROM plays WHERE player_id=$1 AND mode='daily' AND play_date=$2 ORDER BY created_at DESC LIMIT 1`, [playerId, date]);
    return r.rows[0] ? rowToPlay(r.rows[0]) : null;
  }
  async createPlay(play) {
    await this.pool.query(
      `INSERT INTO plays(id,player_id,mode,play_date,question_ids,snapshot,results,score,completed)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [play.id, play.playerId, play.mode, play.playDate, play.questionIds,
       JSON.stringify(play.snapshot), JSON.stringify(play.results), play.score, play.completed]);
    return play;
  }
  async updatePlay(play) {
    await this.pool.query(
      `UPDATE plays SET results=$2, score=$3, completed=$4, updated_at=now() WHERE id=$1`,
      [play.id, JSON.stringify(play.results), play.score, play.completed]);
    return play;
  }
  async getPlay(id) {
    const r = await this.pool.query(`SELECT * FROM plays WHERE id=$1`, [id]);
    return r.rows[0] ? rowToPlay(r.rows[0]) : null;
  }
  async listCompletedDaily(playerId) {
    const r = await this.pool.query(
      `SELECT * FROM plays WHERE player_id=$1 AND mode='daily' AND completed=TRUE ORDER BY play_date`, [playerId]);
    return r.rows.map(rowToPlay);
  }
  async listCompletedPlays(playerId) {
    const r = await this.pool.query(
      `SELECT * FROM plays WHERE player_id=$1 AND completed=TRUE ORDER BY created_at`, [playerId]);
    return r.rows.map(rowToPlay);
  }
  async health() {
    const r = await this.pool.query(`SELECT COUNT(*)::int AS n FROM questions`);
    return { ok: true, db: "postgres", bankQuestions: r.rows[0].n };
  }
}

function rowToPlay(row) {
  return {
    id: row.id, playerId: row.player_id, mode: row.mode, playDate: row.play_date,
    questionIds: row.question_ids, snapshot: row.snapshot, results: row.results,
    score: row.score, completed: row.completed,
  };
}

export async function createStore() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const store = new PgStore(pool);
    await store.init();
    return store;
  }
  const store = new FileStore();
  await store.init();
  return store;
}
