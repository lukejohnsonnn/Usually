// Records real gameplay for the ads: plays on the local server in a phone-shaped
// browser and screencasts it. Each segment is resampled to 30 fps JPEGs in
// tools/ad/<out>/<segment>/ with a manifest.json of frame counts and markers
// (when taps and entries happen, and where) relative to each segment's start.
// Usage: node tools/ad/capture.mjs [bees|fresh]
//   bees  → tools/ad/gameplay/        (bees.html)
//   fresh → tools/ad/gameplay-fresh/  (fresh.html: Daily rounds + Hive Hunt)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startServer } from "../../test/harness.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO = process.argv[2] || "bees";
const OUT = path.join(HERE, SCENARIO === "bees" ? "gameplay" : `gameplay-${SCENARIO}`);
const FPS = 30;
const VIEW = { width: 450, height: 800 }, DSF = 2.4; // 1080 x 1920

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const s = await startServer();
// bees:  round 1 bats (20%), round 2 chimp DNA (99%)
// fresh: round 1 left-handed (11%), round 2 insects (80%), round 3 "largest empire" (text)
// the rest are played off camera, badly enough to stay under 800 (no ruby unlock)
await s.store.putDailySet("2026-11-19", SCENARIO === "bees" ? [196, 273, 249, 173, 260, 189, 78] : [171, 193, 189, 173, 260, 249, 78], { replace: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, hasTouch: false });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

let frames = null; // [{ts, buf}] while recording
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  if (frames) frames.push({ ts: metadata.timestamp, buf: Buffer.from(data, "base64") });
  try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch { /* closing */ }
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });

const manifest = {};
let seg = null;
const now = () => Date.now() / 1000;
async function begin(name) {
  await page.waitForTimeout(150);
  frames = [];
  seg = { name, t0: now(), markers: [] };
}
function mark(label, x, y) { seg.markers.push({ label, t: now() - seg.t0, x: x == null ? null : x * DSF, y: y == null ? null : y * DSF }); }
async function end() {
  const got = frames; frames = null;
  const dur = now() - seg.t0;
  const dir = path.join(OUT, seg.name); fs.mkdirSync(dir);
  // resample to a constant 30 fps: each output frame shows the latest captured frame
  const n = Math.round(dur * FPS);
  let j = 0, last = got[0];
  for (let i = 0; i < n; i++) {
    const t = seg.t0 + i / FPS;
    while (j < got.length && got[j].ts <= t) last = got[j++];
    fs.writeFileSync(path.join(dir, `${String(i).padStart(4, "0")}.jpg`), last.buf);
  }
  manifest[seg.name] = { frames: n, duration: n / FPS, captured: got.length, markers: seg.markers };
  console.log(`${seg.name}: ${n} frames (${got.length} captured, ${(got.length / dur).toFixed(1)} fps real)`);
}

const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
async function tap(loc, label) {
  const c = await center(loc);
  await page.mouse.move(c.x, c.y);
  mark(label, c.x, c.y);
  await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
}
/** drag the range slider through a list of values, like a thumb would */
async function drag(values) {
  const r = page.locator(".question input[type=range], input[type=range]").first();
  const { b } = await center(r);
  const thumb = 14; // half the thumb width, approximately
  const xFor = (v) => b.x + thumb + (b.width - thumb * 2) * (v / 100);
  const y = b.y + b.height / 2;
  const cur = Number(await r.inputValue());
  await page.mouse.move(xFor(cur), y);
  mark("down", xFor(cur), y);
  await page.mouse.down();
  let from = cur;
  for (const [v, ms] of values) {
    const steps = Math.max(4, Math.round(ms / 16));
    for (let k = 1; k <= steps; k++) {
      const p = k / steps, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const x = xFor(from + (v - from) * e);
      await page.mouse.move(x, y);
      mark("move", x, y);
      await page.waitForTimeout(ms / steps);
    }
    from = v;
  }
  await page.mouse.up();
  mark("up", xFor(from), y);
}

// ---- play (bees) -------------------------------------------------------------
async function playBees() {
await page.goto(s.base);
await page.waitForSelector(".parade");
await page.getByRole("button", { name: "Play today's Daily" }).click();
await page.waitForSelector(".question");
await page.waitForTimeout(400);

// Round 1 — bats: wobble around, settle on 18 (2 off: Golden Nectar)
await begin("round1");
await page.waitForTimeout(900);
await drag([[62, 450], [9, 500], [30, 380], [18, 380]]);
await page.waitForTimeout(350);
await tap(page.getByRole("button", { name: "Lock it in" }), "lock");
await page.waitForTimeout(3300);
await end();

await page.getByRole("button", { name: "Next round" }).click();
await page.waitForSelector(".question");
await page.waitForTimeout(400);

// Round 2 — chimp DNA: confident slide straight to 99 (dead on: Divine)
await begin("round2");
await page.waitForTimeout(700);
await drag([[85, 420], [99, 320]]);
await page.waitForTimeout(300);
await tap(page.getByRole("button", { name: "Lock it in" }), "lock");
await page.waitForTimeout(3300);
await end();

// Rounds 3–7 off camera
for (let r = 3; r <= 7; r++) {
  await page.getByRole("button", { name: "Next round" }).click();
  await page.waitForSelector(".question");
  // keep the run under 800 so the results screen shows a tier bee, not the ruby unlock
  if (r === 3 || r === 6) await page.fill("input.field.text", r === 6 ? "British Empire" : "Pizza");
  else await page.fill("input.field", r === 7 ? "30" : "55");
  await page.getByRole("button", { name: "Lock it in" }).click();
  await page.waitForTimeout(900);
}
const seeScore = page.getByRole("button", { name: "See my score" });
await seeScore.waitFor();
await begin("results");
await page.waitForTimeout(300);
await tap(seeScore, "score");
await page.waitForTimeout(3500);
await end();
}

// ---- play (fresh) ------------------------------------------------------------
async function typeAndEnter(text, label) {
  const field = page.locator("input.field.text");
  const c = await center(field);
  mark(`type:${label}`, c.x, c.y);
  await page.keyboard.type(text, { delay: 55 });
  await page.waitForTimeout(120);
  mark(`enter:${label}`, c.x, c.y);
  await page.keyboard.press("Enter");
}
async function playFresh() {
  await page.goto(s.base);
  await page.waitForSelector(".parade");
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  await page.waitForSelector(".question");
  await page.waitForTimeout(400);

  // Round 1 — left-handed (11%): slide to 10, one off (Golden Nectar)
  await begin("guess");
  await page.waitForTimeout(700);
  await drag([[35, 420], [6, 380], [10, 300]]);
  await page.waitForTimeout(300);
  await tap(page.getByRole("button", { name: "Lock it in" }), "lock");
  await page.waitForTimeout(3000);
  await end();

  await page.getByRole("button", { name: "Next round" }).click();
  await page.waitForSelector(".question");
  await page.waitForTimeout(400);
  // Round 2 — insects (80%): dead on (Divine)
  await begin("divine");
  await page.waitForTimeout(600);
  await drag([[92, 420], [80, 380]]);
  await page.waitForTimeout(300);
  await tap(page.getByRole("button", { name: "Lock it in" }), "lock");
  await page.waitForTimeout(3000);
  await end();

  await page.getByRole("button", { name: "Next round" }).click();
  await page.waitForSelector(".question");
  await page.waitForTimeout(400);
  // Round 3 — "Name the #1 largest empire": typed
  await begin("text");
  await page.waitForTimeout(700);
  await page.locator("input.field.text").click();
  await typeAndEnter("British Empire", "empire");
  mark("lock", null, null);
  await page.waitForTimeout(3200);
  await end();

  // rounds 4–7 off camera
  for (let r = 4; r <= 7; r++) {
    await page.getByRole("button", { name: "Next round" }).click();
    await page.waitForSelector(".question");
    if (r === 6) await page.fill("input.field.text", "Pizza");
    else await page.fill("input.field", r === 7 ? "40" : "5");
    await page.getByRole("button", { name: "Lock it in" }).click();
    await page.waitForTimeout(900);
  }
  await page.getByRole("button", { name: "See my score" }).click();
  await page.waitForSelector(".total");
  await page.waitForTimeout(600);

  // Hive Hunt
  await page.goto(s.base);
  await page.waitForSelector(".parade");
  await page.getByRole("button", { name: "Start the hunt" }).first().click();
  await page.waitForSelector(".screen.hunt");
  await page.waitForTimeout(500);
  await begin("hunt");
  await page.waitForTimeout(500);
  await tap(page.getByRole("button", { name: "Start the hunt" }), "start");
  await page.waitForSelector("input.field.text");
  await page.waitForTimeout(500);
  const tries = ["Brazil", "Argentina", "Peru", "Chile", "Mexico", "Colombia", "Venezula", "Ecuador", "Bolivia", "Uruguay", "Paraguay"];
  for (const w of tries) {
    await typeAndEnter(w, w);
    await page.waitForTimeout(260);
    const fb = (await page.locator(".hunt-feedback").textContent()) || "";
    mark(fb.startsWith("✓") ? `found:${w}` : `miss:${w}`, null, null);
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(500);
  await end();
  await page.getByRole("button", { name: /end the hunt/ }).click();
  await begin("huntdone");
  await page.waitForTimeout(3000);
  await end();
}

if (SCENARIO === "bees") await playBees(); else await playFresh();

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
await cdp.send("Page.stopScreencast").catch(() => {});
await browser.close();
await s.close();
