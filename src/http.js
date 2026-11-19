// HTTP layer as a standard fetch handler: (Request) => Response.
// The same handler runs on Cloudflare Workers and on Node (local dev, tests).
// Every route is wrapped: one bad request can never take the app down, and
// every error comes back as JSON.
import { GameError } from "./service.js";
import { isDateStr } from "./game/index.js";

const PLAYER_RE = /^u-[A-Za-z0-9_-]{12,64}$/;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Fixed-window limiter, per client IP, per instance. */
function rateLimiter(limit, windowMs = 60_000) {
  let windowStart = Date.now();
  let hits = new Map();
  return (ip) => {
    const now = Date.now();
    if (now - windowStart >= windowMs) { windowStart = now; hits = new Map(); }
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    return n <= limit;
  };
}

/**
 * @param {object} o
 * @param {object} o.service   game service
 * @param {object} o.store     storage (for /health)
 * @param {(req: Request) => Promise<Response>} o.assets  serves static files and the app shell
 * @param {number} [o.rateLimit] API requests per minute per IP
 */
export function createHandler({ service, store, assets, rateLimit = 200 }) {
  const allow = rateLimiter(rateLimit);

  const player = (req) => {
    const id = req.headers.get("x-player-id") || "";
    if (!PLAYER_RE.test(id)) throw new GameError(400, "Missing or invalid player id.");
    return id;
  };
  const dateParam = (url) => {
    const d = url.searchParams.get("date");
    if (d === null) return undefined;
    if (!isDateStr(d)) throw new GameError(400, "date must be YYYY-MM-DD");
    return d;
  };
  const body = async (req) => {
    const text = await req.text();
    if (text.length > 8192) throw new GameError(400, "Bad request body.");
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw new GameError(400, "Bad request body."); }
  };

  const routes = [
    ["GET", /^\/api\/today$/, async () => service.todaySet()],
    ["POST", /^\/api\/play$/, async (req) => service.startPlay(player(req), (await body(req)).mode)],
    ["POST", /^\/api\/play\/([^/]+)\/submit$/, async (req, _url, m) => {
      const b = await body(req);
      return service.submit(player(req), decodeURIComponent(m[1]), { round: Number(b.round), value: b.value });
    }],
    ["GET", /^\/api\/results$/, async (req, url) => ({ play: await service.dailyResults(player(req), dateParam(url)) })],
    ["GET", /^\/api\/stats$/, async (req) => service.stats(player(req))],
    ["GET", /^\/api\/yesterday$/, async () => service.yesterday()],
    ["GET", /^\/api\/share$/, async (req, url) => service.share(player(req), dateParam(url))],
  ];

  return async function handle(req, { ip = "unknown" } = {}) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/health") {
        let db = store.kind;
        try { await store.ping(); } catch { db = `${store.kind} (unreachable)`; }
        return json({ ok: !db.includes("unreachable"), db, bankQuestions: service.bankSize, date: service.today() });
      }
      if (url.pathname.startsWith("/api/")) {
        if (!allow(ip)) return json({ error: "Slow down a little and try again in a minute." }, 429);
        for (const [method, re, fn] of routes) {
          const m = url.pathname.match(re);
          if (m && req.method === method) return json(await fn(req, url, m));
        }
        return json({ error: "Not found." }, 404);
      }
      return await assets(req);
    } catch (err) {
      if (err instanceof GameError) return json({ error: err.message }, err.status);
      console.error("[error]", err);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}
