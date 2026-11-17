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
  return { dailySets: {}, plays: {}, votes: {}, qstats: {}, overrides: {} };
}

// ---------------------------------------------------------------- file store
class FileStore {
  constructor() {
    this.kind = "file";
    try { this.state = JSON.parse(fs.readFileSync(LOCAL_PATH, "utf8")); }
    catch { this.state = emptyState(); }
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
  async getLiveAnswer(id) { return this.state.overrides[id] ?? null; }
  async setLiveAnswer(id, answer) { this.state.overrides[id] = answer; this.save(); }
  async getDailySet(date) { return this.state.dailySets[date] || null; }
  async saveDailySet(date, ids) { this.state.dailySets[date] = ids; this.save(); return ids; }
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
  async hasVoted(playerId, qid) { return Boolean(this.state.votes[`${playerId}:${qid}`]); }
  async castVote(playerId, qid, vote) {
    if (await this.hasVoted(playerId, qid)) return { ok: false, error: "Already voted on this one." };
    this.state.votes[`${playerId}:${qid}`] = { playerId, questionId: qid, vote, at: new Date().toISOString() };
    const s = this.state.qstats[qid] || (this.state.qstats[qid] = { yes: 0, no: 0, left: 0, right: 0, total: 0 });
    if (vote === "yes") s.yes++;
    if (vote === "no") s.no++;
    if (vote === "left") s.left++;
    if (vote === "right") s.right++;
    s.total++;
    this.save();
    return { ok: true, total: s.total };
  }
  async getQStats(qid) { return this.state.qstats[qid] || { yes: 0, no: 0, left: 0, right: 0, total: 0 }; }
  async votedIds(playerId) {
    return Object.values(this.state.votes).filter((v) => v.playerId === playerId).map((v) => v.questionId);
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
      vote_prompt TEXT, text_answers JSONB, unlisted JSONB)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS daily_sets(
      date TEXT PRIMARY KEY, question_ids INT[] NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS plays(
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL,
      play_date TEXT NOT NULL, question_ids INT[] NOT NULL, snapshot JSONB NOT NULL,
      results JSONB NOT NULL DEFAULT '[]', score INT NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS plays_player_daily ON plays(player_id, mode, play_date)`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS votes(
      player_id TEXT NOT NULL, question_id INT NOT NULL, vote TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(player_id, question_id))`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS question_stats(
      question_id INT PRIMARY KEY, yes INT NOT NULL DEFAULT 0, no INT NOT NULL DEFAULT 0,
      left_votes INT NOT NULL DEFAULT 0, right_votes INT NOT NULL DEFAULT 0, total INT NOT NULL DEFAULT 0)`);
  }
  async seedBank(bank) {
    let inserted = 0;
    for (const q of bank.questions) {
      const r = await this.pool.query(
        `INSERT INTO questions(id,kind,category,text,answer,note,left_label,right_label,finale,votable,vote_prompt,text_answers,unlisted)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
        [q.id, q.kind, q.category, q.text, q.answer, q.note, q.leftLabel || null, q.rightLabel || null,
         q.finale, q.votable, q.votePrompt || null,
         q.textAnswers ? JSON.stringify(q.textAnswers) : null,
         q.unlisted ? JSON.stringify(q.unlisted) : null]);
      inserted += r.rowCount;
    }
    return { inserted };
  }
  async getBank() {
    const r = await this.pool.query(`SELECT * FROM questions ORDER BY id`);
    return r.rows.map((row) => ({
      id: row.id, kind: row.kind, category: row.category, text: row.text,
      answer: row.answer == null ? null : Number(row.answer), note: row.note,
      leftLabel: row.left_label, rightLabel: row.right_label, finale: row.finale,
      votable: row.votable, votePrompt: row.vote_prompt,
      textAnswers: row.text_answers || undefined, unlisted: row.unlisted || undefined,
    }));
  }
  async getLiveAnswer(id) {
    const r = await this.pool.query(`SELECT answer FROM questions WHERE id=$1`, [id]);
    return r.rows[0] ? Number(r.rows[0].answer) : null;
  }
  async setLiveAnswer(id, answer) {
    await this.pool.query(`UPDATE questions SET answer=$2 WHERE id=$1`, [id, answer]);
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
  async hasVoted(playerId, qid) {
    const r = await this.pool.query(`SELECT 1 FROM votes WHERE player_id=$1 AND question_id=$2`, [playerId, qid]);
    return r.rowCount > 0;
  }
  async castVote(playerId, qid, vote) {
    const r = await this.pool.query(
      `INSERT INTO votes(player_id, question_id, vote) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *`,
      [playerId, qid, vote]);
    if (!r.rows[0]) return { ok: false, error: "Already voted on this one." };
    const col = vote === "yes" ? "yes" : vote === "no" ? "no" : vote === "left" ? "left_votes" : "right_votes";
    const s = await this.pool.query(
      `INSERT INTO question_stats(question_id, ${col}, total) VALUES($1, 1, 1)
       ON CONFLICT (question_id) DO UPDATE SET ${col} = question_stats.${col} + 1, total = question_stats.total + 1
       RETURNING total`, [qid]);
    return { ok: true, total: s.rows[0].total };
  }
  async getQStats(qid) {
    const r = await this.pool.query(`SELECT * FROM question_stats WHERE question_id=$1`, [qid]);
    const row = r.rows[0];
    return row ? { yes: row.yes, no: row.no, left: row.left_votes, right: row.right_votes, total: row.total }
               : { yes: 0, no: 0, left: 0, right: 0, total: 0 };
  }
  async votedIds(playerId) {
    const r = await this.pool.query(`SELECT question_id FROM votes WHERE player_id=$1`, [playerId]);
    return r.rows.map((x) => x.question_id);
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
