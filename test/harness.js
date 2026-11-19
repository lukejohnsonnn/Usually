// Spins up the real Express app on a random port with a controllable clock.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { createService, loadBank } from "../src/service.js";
import { createFileStore } from "../src/store/file.js";

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const bank = loadBank(path.join(root, "data", "bank.json"));

export async function startServer({ store = createFileStore(null), at = "2026-11-19T15:00:00Z", rateLimit = 10_000 } = {}) {
  let nowMs = Date.parse(at);
  const clock = { set: (iso) => { nowMs = Date.parse(iso); }, addDays: (n) => { nowMs += n * 86_400_000; } };
  await store.init();
  const service = createService({ store, bank, now: () => new Date(nowMs) });
  const app = createApp({ service, store, rateLimit });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(p, { method = "GET", body, player = "u-testplayer000001", raw } = {}) {
    const headers = {};
    if (player) headers["x-player-id"] = player;
    if (body !== undefined || raw !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(base + p, { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  return { base, call, clock, service, store, close: () => new Promise((r) => server.close(r)) };
}

/** Strings that must never appear in a pre-submit payload for these questions. */
export function secretsFor(ids) {
  const out = [];
  const visible = ids.map((id) => bank.find((x) => x.id === id))
    .map((q) => [q.text, q.category].join(" ").toLowerCase()).join(" ");
  for (const id of ids) {
    const q = bank.find((x) => x.id === id);
    if (q.kind === "text") {
      out.push(q.top1);
      for (const slot of q.textAnswers.slice(0, 5)) out.push(...slot.texts);
    }
    if (q.source) out.push(q.source);
    if (q.note) out.push(q.note);
  }
  // a variant that is literally part of the public prompt text is not a secret
  return out.filter((s) => s && s.length > 3 && !visible.includes(s.toLowerCase()));
}

export const FORBIDDEN_KEYS = ["answer", "textAnswers", "top1", "unlisted", "source", "sourceUrl", "note", "snapshot"];

export function findKeys(obj, keys, trail = "$", hits = []) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (keys.includes(k)) hits.push(`${trail}.${k}`);
      findKeys(v, keys, `${trail}.${k}`, hits);
    }
  }
  return hits;
}
