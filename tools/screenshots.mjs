// Captures every screen of a worst-case Daily at 390x844 (2x). Usage: node tools/screenshots.mjs [outDir]
import fs from "node:fs";
import { createRequire } from "node:module";
import { startServer } from "../test/harness.js";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = process.argv[2] || "screenshots";
fs.mkdirSync(OUT, { recursive: true });
const s = await startServer();
await s.store.putDailySet("2026-11-19", [186, 170, 249, 173, 260, 189, 78], { replace: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const shot = async (n) => { await p.waitForTimeout(1000); await p.screenshot({ path: `${OUT}/${n}.png` }); };
// give the player some history for the home screen
await p.goto(s.base); await p.waitForSelector(".parade");
await shot("01-home");
await p.getByRole("button", { name: "Play today's Daily" }).click(); await p.waitForSelector(".question");
await p.fill("input.field", "40"); await shot("02-guess");
await p.getByRole("button", { name: "Lock it in" }).click(); await shot("03-guess-reveal");
await p.getByRole("button", { name: "Next round" }).click(); await p.waitForSelector(".question");
await p.$eval("input[type=range]", (el) => { el.value = "1"; el.dispatchEvent(new Event("input")); });
await p.getByRole("button", { name: "Fine-tune hundredths" }).click(); await p.waitForSelector(".sheet");
await p.$eval(".sheet input[type=range]", (el) => { el.value = "24"; el.dispatchEvent(new Event("input")); }); await shot("04-finetune");
await p.getByRole("button", { name: "OK" }).click();
await p.getByRole("button", { name: "Lock it in" }).click(); await shot("05-sub1-reveal");
await p.getByRole("button", { name: "Next round" }).click(); await p.waitForSelector(".question");
await p.fill("input.field.text", "Business"); await shot("06-text");
await p.getByRole("button", { name: "Lock it in" }).click(); await shot("07-text-reveal");
await p.getByRole("button", { name: "Next round" }).click(); await p.waitForSelector(".question");
await p.fill("input.field", "60"); await shot("08-guess-2");
await p.getByRole("button", { name: "Lock it in" }).click(); await shot("09-guess-2-reveal");
for (let r = 4; r < 7; r++) {
  await p.getByRole("button", { name: "Next round" }).click(); await p.waitForSelector(".question");
  if (r === 5) await p.fill("input.field.text", "Mongol Empire"); else if (r === 6) await p.fill("input.field", "17");
  await p.getByRole("button", { name: "Lock it in" }).click();
  if (r === 6) await shot("10-finale-bullseye");
}
await p.getByRole("button", { name: "See my score" }).click(); await p.waitForSelector(".total");
await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/11-results.png`, fullPage: true });
await p.getByRole("button", { name: "Home" }).click(); await shot("12-home-done");
await p.getByRole("button", { name: "Yesterday's answers" }).click(); await shot("13-yesterday");
await b.close(); await s.close();
