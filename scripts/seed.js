// Seed the question bank into the database WITHOUT wiping plays or votes.
// Safe to re-run: INSERT ... ON CONFLICT DO NOTHING (Postgres) / no-op (file store).
// Usage (Render): set DATABASE_URL, then `npm run seed`.
// Usage (local):  `npm run seed` (uses data/bank.json; file store reads it directly).
import { createStore, loadBank } from "../db.js";

const bank = loadBank();
const store = await createStore();
const r = await store.seedBank(bank);
console.log(`Seed done (store: ${store.kind}).`, r);
console.log(`Bank: ${bank.meta.counts.total} questions (${bank.meta.counts.guess} guess, ${bank.meta.counts.split} split, ${bank.meta.counts.finale} finale, ${bank.meta.counts.text} text).`);
process.exit(0);
