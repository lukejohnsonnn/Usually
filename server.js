// Local development server (Node). Production runs on Cloudflare Workers
// (src/worker.js) — both use the same game service and HTTP handler.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createService } from "./src/service.js";
import { loadBank, loadOverrides } from "./src/load.js";
import { createHandler } from "./src/http.js";
import { createFileStore } from "./src/store/file.js";
import { listen, serveStatic } from "./src/node-server.js";

const root = path.dirname(fileURLToPath(import.meta.url));

process.on("unhandledRejection", (err) => console.error("[process] unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("[process] uncaught exception:", err));

const bank = loadBank(path.join(root, "data", "bank.json"));
const store = createFileStore(process.env.LOCAL_DATA_PATH || path.join(root, "data", "local.json"));
await store.init();
const overrides = loadOverrides(path.join(root, "data", "daily-overrides.json"), bank);
const service = createService({ store, bank, overrides });

try {
  const ids = await service.ensureDailySet(service.today());
  console.log(`[boot] daily ${service.today()} -> ${ids.join(",")}`);
} catch (err) {
  console.error("[boot] could not freeze today's set:", err);
}

const handle = createHandler({ service, store, assets: serveStatic, rateLimit: Number(process.env.RATE_LIMIT) || 200 });
const port = Number(process.env.PORT) || 3000;
const server = await listen(handle, port);
console.log(`[boot] Honeydle on :${port} — ${store.kind} store, ${bank.length} questions`);

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(async () => { await store.close().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
