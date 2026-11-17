// Regression test for PgStore.seedBank (db.js): bank.json is authoritative.
// Old bank rows + votes -> seed new bank -> answers update, votes for changed
// answers clear, votes for unchanged answers survive, removed questions and
// their votes/stats are deleted. Runs against in-memory Postgres (pg-mem) via
// scripts/pg-mem-loader.mjs; exit code 0 = pass. Spawned by scripts/verify.js.
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL = "postgres://test/test";
const { createStore, loadBank } = await import(path.join(REPO, "db.js"));
const store = await createStore();
console.log("store kind:", store.kind);

const newBank = loadBank();
const newById = new Map(newBank.questions.map((q) => [q.id, q]));

// Fake OLD bank: a few questions with pre-audit answers + 2 removed ones.
const oldQs = [
  { ...structuredClone(newById.get(2)), answer: 71 },   // changed 71 -> 13
  { ...structuredClone(newById.get(59)), answer: 0.2 }, // unchanged
  { ...structuredClone(newById.get(142)), answer: 28 }, // changed 28 -> 41
  { id: 16, kind: "guess", category: "Social survival", text: "What % of people have waved back at someone who wasn't waving at them?", answer: 91, note: null, finale: false, votable: true },
  { id: 53, kind: "split", category: "Screen time · Split", text: "Readers — how do they split on format?", answer: 71, note: null, leftLabel: "Paper books", rightLabel: "E-books", finale: false, votable: true },
];
const r1 = await store.seedBank({ questions: oldQs });
console.log("seed old:", JSON.stringify(r1));

await store.castVote("player-a", 2, "yes");
await store.castVote("player-b", 2, "yes");
await store.castVote("player-a", 59, "no");
await store.castVote("player-a", 16, "yes");
await store.castVote("player-a", 142, "yes");

const db = globalThis.__pgmemDb;
const q = async (sql, p) => (await db.public.query(sql, p)).rows;

const r2 = await store.seedBank(newBank);
console.log("seed new:", JSON.stringify(r2));

const rows = await q("SELECT id, answer FROM questions WHERE id IN (2, 59, 142, 16, 53, 148) ORDER BY id");
const byId = new Map(rows.map((r) => [r.id, Number(r.answer)]));
const voted = new Set((await q("SELECT question_id FROM votes")).map((r) => r.question_id));
const statIds = new Set((await q("SELECT question_id FROM question_stats")).map((r) => r.question_id));
const total = (await q("SELECT COUNT(*)::int AS n FROM questions"))[0].n;

const assert = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) process.exitCode = 1; };
assert("Q2 answer updated 71 -> 13", byId.get(2) === 13);
assert("Q142 answer updated 28 -> 41", byId.get(142) === 41);
assert("Q59 answer kept 0.2", byId.get(59) === 0.2);
assert("Q16 row deleted", !byId.has(16));
assert("Q53 row deleted", !byId.has(53));
assert("Q148 inserted", byId.has(148));
assert("Q2 votes cleared (answer changed)", !voted.has(2));
assert("Q142 votes cleared (answer changed)", !voted.has(142));
assert("Q59 votes kept (answer unchanged)", voted.has(59));
assert("Q16 votes cleared (question removed)", !voted.has(16));
assert("Q2 stats cleared", !statIds.has(2));
assert("Q59 stats kept", statIds.has(59));
assert("question count is 142", total === 142);
