// pg-mem-backed stand-in for the "pg" module (default export { Pool, Client }).
// Only used by the seed-upsert regression test via scripts/pg-mem-loader.mjs.
import { newDb } from "pg-mem";

export const pgmemDb = newDb();
globalThis.__pgmemDb = pgmemDb;
const { Pool, Client } = pgmemDb.adapters.createPg();
export default { Pool, Client };
export { Pool, Client };
