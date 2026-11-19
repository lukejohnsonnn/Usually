// Honeydle server entry point.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.js";
import { createService, loadBank, loadOverrides } from "./src/service.js";
import { createFileStore } from "./src/store/file.js";
import { createPostgresStore } from "./src/store/postgres.js";

const root = path.dirname(fileURLToPath(import.meta.url));

process.on("unhandledRejection", (err) => console.error("[process] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[process] uncaught exception:", err));

const bank = loadBank(path.join(root, "data", "bank.json"));
const store = process.env.DATABASE_URL
  ? createPostgresStore(process.env.DATABASE_URL)
  : createFileStore(process.env.LOCAL_DATA_PATH || path.join(root, "data", "local.json"));

await store.init();
const overrides = loadOverrides(path.join(root, "data", "daily-overrides.json"), bank);
const service = createService({ store, bank, overrides });

// Self-heal on boot: make sure today's set is frozen and healthy.
try {
  const ids = await service.ensureDailySet(service.today());
  console.log(`[boot] daily ${service.today()} -> ${ids.join(",")}`);
} catch (err) {
  console.error("[boot] could not freeze today's set:", err);
}

const app = createApp({ service, store, rateLimit: Number(process.env.RATE_LIMIT) || 200 });
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`[boot] Honeydle on :${port} — ${store.kind} store, ${bank.length} questions`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(async () => { await store.close().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
