// Cloudflare Worker entry point: the game API on Workers, the database on D1,
// and the client (public/) served by Workers static assets.
import rawBank from "../data/bank.json";
import rawOverrides from "../data/daily-overrides.json";
import rawSchedule from "../data/schedule.json";
import { createService, prepareBank, prepareOverrides } from "./service.js";
import { createHandler } from "./http.js";
import { createD1Store } from "./store/d1.js";
import { canonicalRedirect } from "./canonical.js";

// Built once per Worker instance and reused across requests.
let app = null;
function getApp(env) {
  if (app) return app;
  const bank = prepareBank(rawBank);
  const store = createD1Store(env.DB);
  const scheduled = (rawSchedule.days || []).map((d) => ({ date: d.date, ids: d.ids, resetPlays: false }));
  const overrides = prepareOverrides([...scheduled, ...rawOverrides], bank); // later entries win
  const service = createService({ store, bank, overrides });
  const handle = createHandler({
    service,
    store,
    rateLimit: Number(env.RATE_LIMIT) || 200,
    assets: (req) => env.ASSETS.fetch(req),
  });
  app = { handle };
  return app;
}

export default {
  async fetch(request, env) {
    const redirect = canonicalRedirect(request);
    if (redirect) return redirect;
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    return getApp(env).handle(request, { ip });
  },
};
