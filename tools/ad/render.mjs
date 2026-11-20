// Renders tools/ad/ad.html to a 1080x1920 (9:16) MP4, frame by frame, so the
// timing is exact regardless of machine speed.
// Usage: node tools/ad/render.mjs [out.mp4] [fps]   (needs ffmpeg on PATH)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2] || "honeydle-ad.mp4";
const FPS = Number(process.argv[3] || 30);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css" };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(`${base}/tools/ad/ad.html`);
await page.waitForFunction(() => window.ready === true);
page.on("pageerror", (e) => console.error("page error:", e.message));
// --stills DIR t1,t2,…  writes PNG stills at those times instead of a video
if (process.argv[2] === "--stills") {
  const dir = process.argv[3];
  fs.mkdirSync(dir, { recursive: true });
  for (const t of process.argv[4].split(",").map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: path.join(dir, `still-${t}.png`) });
  }
  await browser.close(); server.close(); process.exit(0);
}
const duration = await page.evaluate(() => window.DURATION);
const frames = Math.round(duration * FPS);

const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], { stdio: ["pipe", "inherit", "inherit"] });

for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  const buf = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % FPS === 0) process.stdout.write(`\r${Math.round((i / frames) * 100)}%`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await browser.close();
server.close();
console.log(`\nwrote ${OUT} (${frames} frames, ${duration}s @ ${FPS}fps)`);
