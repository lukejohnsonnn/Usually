// End to end against the real Worker: `wrangler dev` runs src/worker.js in
// Cloudflare's workerd runtime with static assets and a local D1, and we
// play the game over HTTP and in a browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bank, root, FORBIDDEN_KEYS, findKeys } from "./harness.js";

const require = createRequire(import.meta.url);
let playwright = null;
try { playwright = require("playwright"); } catch { /* optional */ }

const port = 18000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
let child;
let log = "";

before(async () => {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "hd-wr-"));
  child = spawn(path.join(root, "node_modules", ".bin", "wrangler"),
    ["dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", persist, "--show-interactive-dev-session=false"],
    { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${log}`);
}, { timeout: 90_000 });

after(() => { child?.kill("SIGTERM"); });

const call = async (p, { method = "GET", body, player = "u-workerplayer0001" } = {}) => {
  const res = await fetch(base + p, {
    method,
    headers: { ...(player ? { "x-player-id": player } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, type: res.headers.get("content-type") || "" };
};

test("worker: health reports D1 and the bank", async () => {
  const h = await call("/health");
  assert.equal(h.status, 200);
  assert.equal(h.json.ok, true);
  assert.equal(h.json.db, "d1");
  assert.equal(h.json.bankQuestions, bank.filter((q) => !q.retired).length);
});

test("worker: static client, SPA fallback, and nothing private is served", async () => {
  const home = await call("/");
  assert.match(home.type, /text\/html/);
  assert.match(home.text, /<div id="app">/);
  assert.match((await call("/js/app.js")).type, /javascript/);
  assert.match((await call("/js/rules.js")).text, /export const TIERS/);
  assert.match((await call("/img/bee-diamond.png")).type, /image\/png/);
  assert.match((await call("/some/deep/link")).text, /<div id="app">/, "unknown pages get the app shell");
  assert.doesNotMatch((await call("/data/bank.json")).text, /textAnswers/);
  assert.doesNotMatch((await call("/src/worker.js")).text, /createD1Store/);
  const missing = await call("/api/nope");
  assert.equal(missing.status, 404);
  assert.ok(missing.json.error, "API 404s are JSON, not the app shell");
});

test("worker: a full Daily — secret before submit, scored after, one per player", async () => {
  const P = "u-workerdaily0001";
  const play = (await call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json;
  assert.equal(play.questions.length, 7);
  assert.deepEqual(findKeys(play, FORBIDDEN_KEYS), []);
  assert.equal((await call("/api/play", { method: "POST", player: P, body: { mode: "daily" } })).json.id, play.id);
  for (let r = 0; r < 7; r++) {
    const q = bank.find((x) => x.id === play.questions[r].id);
    const out = await call(`/api/play/${play.id}/submit`, { method: "POST", player: P, body: { round: r, value: q.kind === "text" ? q.top1 : q.answer } });
    assert.equal(out.status, 200, out.text);
    assert.equal(out.json.result.points, 175);
  }
  const res = (await call("/api/results", { player: P })).json.play;
  assert.equal(res.score, 1225);
  assert.equal((await call("/api/stats", { player: P })).json.streak, 1);
  assert.match((await call("/api/share", { player: P })).json.text, /^Honeydle \d{4}-\d{2}-\d{2}\n.+\n🍯 1225$/u);
  assert.equal((await call("/api/yesterday")).json.rounds.length, 7);
  assert.equal((await call("/api/play", { method: "POST", player: P, body: { mode: "weekly" } })).status, 400, "bad mode is a JSON 400");
});

test("worker: the game plays in a real browser", { skip: playwright ? false : "playwright not installed" }, async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForSelector(".parade .bee-slot");
    await page.getByRole("button", { name: /today's Daily/ }).click();
    await page.waitForSelector(".question");
    await page.getByRole("button", { name: "Lock it in" }).click();
    await page.waitForSelector(".reveal .tier");
    assert.ok((await page.textContent(".reveal .tier")).length > 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("worker: search-engine files and link-preview tags", async () => {
  const robots = await call("/robots.txt");
  assert.match(robots.text, /Sitemap: https:\/\/honeydle\.com\/sitemap\.xml/);
  assert.match(robots.text, /Disallow: \/api\//);
  assert.match((await call("/sitemap.xml")).text, /<loc>https:\/\/honeydle\.com\/<\/loc>/);
  const home = (await call("/")).text;
  assert.match(home, /<link rel="canonical" href="https:\/\/honeydle\.com\/">/);
  assert.match(home, /property="og:image" content="https:\/\/honeydle\.com\/img\/og-card\.png"/);
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld["@graph"][0].name, "Honeydle");
  assert.match(home, /a free daily guessing game built on real numbers/i, "readable without JavaScript");
  assert.match((await call("/img/og-card.png")).type, /image\/png/);
  const ico = await fetch(`${base}/favicon.ico`);
  assert.match(ico.headers.get("content-type") || "", /icon/, "a real favicon.ico, not the app shell");
  assert.match(home, /<link rel="icon" href="\/favicon\.ico" sizes="48x48">/);
});

test("worker: www and workers.dev redirect permanently to honeydle.com", async () => {
  const { canonicalRedirect } = await import("../src/canonical.js");
  const r1 = canonicalRedirect(new Request("https://www.honeydle.com/some/page?x=1"));
  assert.equal(r1.status, 301);
  assert.equal(r1.headers.get("location"), "https://honeydle.com/some/page?x=1");
  const r2 = canonicalRedirect(new Request("https://honeydle.lukejohnson.workers.dev/"));
  assert.equal(r2.headers.get("location"), "https://honeydle.com/");
  assert.equal(canonicalRedirect(new Request("https://honeydle.com/")), null);
  assert.equal(canonicalRedirect(new Request("http://127.0.0.1:8787/")), null, "local dev is left alone");
});
