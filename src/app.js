// HTTP layer. Every handler is wrapped: one bad request can never take the
// process down, and every error comes back as JSON.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameError } from "./service.js";
import { isDateStr } from "./game/index.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const RULES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "game", "rules.js");
const PLAYER_RE = /^u-[A-Za-z0-9_-]{12,64}$/;

function rateLimiter({ limit = 200, windowMs = 60_000 } = {}) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > limit) return res.status(429).json({ error: "Slow down a little and try again in a minute." });
    next();
  };
}

export function createApp({ service, store, rateLimit = 200 }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "8kb" }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const player = (req) => {
    const id = req.get("x-player-id") || "";
    if (!PLAYER_RE.test(id)) throw new GameError(400, "Missing or invalid player id.");
    return id;
  };
  const dateParam = (req) => {
    const d = req.query.date;
    if (d === undefined) return undefined;
    if (!isDateStr(d)) throw new GameError(400, "date must be YYYY-MM-DD");
    return d;
  };

  app.get("/health", wrap(async (_req, res) => {
    let db = store.kind;
    try { await store.ping(); } catch { db = `${store.kind} (unreachable)`; }
    res.json({ ok: !db.includes("unreachable"), db, bankQuestions: service.bankSize, date: service.today() });
  }));

  const api = express.Router();
  api.use(rateLimiter({ limit: rateLimit }));
  api.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  api.get("/today", wrap(async (_req, res) => res.json(await service.todaySet())));
  api.post("/play", wrap(async (req, res) => res.json(await service.startPlay(player(req), req.body?.mode))));
  api.post("/play/:id/submit", wrap(async (req, res) => {
    const round = Number(req.body?.round);
    res.json(await service.submit(player(req), String(req.params.id), { round, value: req.body?.value }));
  }));
  api.get("/results", wrap(async (req, res) => res.json({ play: await service.dailyResults(player(req), dateParam(req)) })));
  api.get("/stats", wrap(async (req, res) => res.json(await service.stats(player(req)))));
  api.get("/yesterday", wrap(async (_req, res) => res.json(await service.yesterday())));
  api.get("/share", wrap(async (req, res) => res.json(await service.share(player(req), dateParam(req)))));
  api.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use("/api", api);

  // The client shares the pure rules module (tiers, bee choice, formatting).
  // It carries no answers; only this one file is exposed.
  app.get("/shared/rules.js", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.type("application/javascript").sendFile(RULES_FILE);
  });

  app.use(express.static(PUBLIC_DIR, {
    setHeaders(res, file) {
      if (/\.(html|webmanifest|js|css)$/.test(file)) res.set("Cache-Control", "no-cache");
      else res.set("Cache-Control", "public, max-age=3600");
    },
  }));
  app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
      return res.status(400).json({ error: "Bad request body." });
    }
    console.error("[error]", err);
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });
  return app;
}
