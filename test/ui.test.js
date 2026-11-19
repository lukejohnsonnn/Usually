// Browser checks with Playwright against the real app: a full Daily on a
// 390 × 844 phone, the one-screen rule, secrecy in the DOM, fine-tune,
// resume, results, share, overlays and the narrow-phone layout.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer, bank, secretsFor } from "./harness.js";

const require = createRequire(import.meta.url);
let playwright = null;
try { playwright = require("playwright"); } catch { /* not installed */ }
const skip = playwright ? false : "playwright is not installed";

let s, browser;
const byId = new Map(bank.map((q) => [q.id, q]));

before(async () => {
  if (skip) return;
  s = await startServer();
  browser = await playwright.chromium.launch();
});
after(async () => { await browser?.close(); await s?.close(); });

async function newPhone(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { ctx, page, errors };
}

/** Bottom edge of the screen's content (document coordinates), once animations settle. */
const pageHeight = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll(".screen > *")].filter((e) => !e.matches("footer"));
  return Math.ceil(Math.max(...els.map((e) => e.getBoundingClientRect().bottom + window.scrollY)));
});
// The longest prompts and notes in the bank, in a valid Daily order — the layout worst case.
const WORST_CASE_SET = [161, 59, 249, 170, 173, 189, 78];

test("a full Daily on a phone: one screen per round, nothing leaks before submit", { skip }, async () => {
  await s.store.putDailySet("2026-11-19", WORST_CASE_SET, { replace: true });
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  await page.waitForSelector(".question");
  const ids = (await s.call("/api/today")).json.questions.map((q) => q.id);
  assert.deepEqual(ids, WORST_CASE_SET);
  const secrets = secretsFor(ids);

  for (let r = 0; r < 7; r++) {
    await page.waitForFunction((n) => document.querySelector(".progress .label")?.textContent.startsWith(`Round ${n}`), r + 1);
    const q = byId.get(ids[r]);
    const html = await page.content();
    for (const secret of secretsFor([q.id])) assert.ok(!html.includes(secret), `round ${r + 1} DOM leaks "${secret}"`);
    await page.waitForTimeout(300);
    const hq = await pageHeight(page);
    assert.ok(hq <= 844, `round ${r + 1} question + controls fit (got ${hq}px)`);

    if (q.kind === "text") {
      await page.fill("input.field.text", r === 2 ? q.top1 : "definitely not listed");
    } else if (q.kind === "split") {
      await page.$eval("input[type=range]", (el, v) => { el.value = String(v); el.dispatchEvent(new Event("input")); }, q.answer);
    } else {
      await page.fill("input.field", String(q.answer)); // the typed field mirrors into the slider
    }
    await page.getByRole("button", { name: "Lock it in" }).click();
    await page.waitForSelector(".reveal .tier");
    await page.waitForTimeout(900); // let the staggered fill finish
    const h = await pageHeight(page);
    assert.ok(h <= 844, `round ${r + 1} (${q.kind}) question + reveal fit one 390×844 screen (got ${h}px)`);
    const tier = await page.textContent(".reveal .tier");
    if (r !== 5) assert.equal(tier, "Bullseye", `round ${r + 1}`);
    if (q.kind === "text") {
      const revealText = await page.textContent(".reveal");
      if (r === 5) assert.match(revealText, /not on the list/);
    }
    const bee = await page.$eval(".hero img.bee", (img) => ({ src: img.getAttribute("src"), rendering: getComputedStyle(img).imageRendering }));
    assert.equal(bee.rendering, "pixelated");
    if (r === 1) assert.match(bee.src, /diamond/, "second consecutive Bullseye is diamond");
    await page.getByRole("button", { name: r === 6 ? "See my score" : "Next round" }).click();
  }

  await page.waitForSelector(".total");
  const total = Number(await page.textContent(".total"));
  assert.ok(total >= 900);
  assert.ok(await page.isVisible(".ruby-label"), "900+ shows the ruby bee");
  assert.equal(await page.locator(".row").count(), 7);
  void secrets;

  // share: clipboard path on a non-touch browser
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: s.base });
  await page.getByRole("button", { name: "Share my score" }).click();
  await page.waitForSelector(".toast");
  assert.equal(await page.textContent(".toast"), "Share card copied.");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^Honeydle 2026-11-19\n.+\n\d+\/1225\n\nPlay Honeydle — How well do you know the world\?/u);

  // home now shows "Done for today"
  await page.getByRole("button", { name: "Home" }).click();
  await page.waitForSelector(".daily-card .done");
  assert.match(await page.textContent(".daily-card .done"), new RegExp(`${total} / 1225`));
  assert.equal(await page.textContent(".stat .v"), "1", "streak card");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("resume: reloading mid-run returns to the next unanswered round", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  await page.waitForSelector(".question");
  await page.getByRole("button", { name: "Lock it in" }).click();
  await page.waitForSelector(".reveal");
  await page.reload();
  await page.getByRole("button", { name: "Resume today's Daily" }).click();
  await page.waitForFunction(() => document.querySelector(".progress .label")?.textContent.startsWith("Round 2"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("fine-tune: hundredths below 1%", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.getByRole("button", { name: "Endless practice" }).click();
  await page.waitForSelector("input[type=range]");
  assert.equal(await page.isVisible(".fine-btn"), false, "hidden above 1%");
  await page.$eval("input[type=range]", (el) => { el.value = "1"; el.dispatchEvent(new Event("input")); });
  await page.getByRole("button", { name: "Fine-tune hundredths" }).click();
  await page.waitForSelector(".sheet .fine-value");
  await page.$eval(".sheet input[type=range]", (el) => { el.value = "7"; el.dispatchEvent(new Event("input")); });
  assert.equal(await page.textContent(".sheet .fine-value"), "0.07%");
  await page.getByRole("button", { name: "OK" }).click();
  assert.equal((await page.textContent(".bignum")).trim(), "0.07%");
  assert.equal(await page.inputValue("input.field"), "0.07");
  // typed field mirrors too
  await page.fill("input.field", "0.25");
  assert.equal((await page.textContent(".bignum")).trim(), "0.25%");
  await page.fill("input.field", "64");
  assert.equal(await page.inputValue("input[type=range]"), "64");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("overlays: how to play and yesterday's answers", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.getByRole("button", { name: "How to play" }).first().click();
  await page.waitForSelector(".sheet");
  assert.match(await page.textContent(".sheet"), /A perfect guess is a Bullseye/);
  await page.getByRole("button", { name: "Got it" }).click();
  assert.equal(await page.$(".sheet"), null);
  await page.getByRole("button", { name: "Yesterday's answers" }).click();
  await page.waitForSelector(".sheet .y-row");
  assert.equal(await page.locator(".sheet .y-row").count(), 7);
  await page.keyboard.press("Escape");
  assert.equal(await page.$(".sheet"), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("narrow phones: no horizontal scroll at 320px; text round shows exactly one tip", { skip }, async () => {
  const { ctx, page, errors } = await newPhone({ viewport: { width: 320, height: 640 } });
  await page.goto(s.base);
  await page.waitForSelector(".parade");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `home overflows by ${over}px`);
  await page.getByRole("button", { name: "Endless practice" }).click();
  for (let r = 0; r < 3; r++) {
    await page.waitForSelector(".question");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `round ${r + 1} fits width`);
    if (r < 2) {
      await page.getByRole("button", { name: "Lock it in" }).click();
      await page.getByRole("button", { name: "Next round" }).click();
    }
  }
  assert.equal(await page.locator(".hint").count(), 1);
  assert.equal(await page.textContent(".hint"), "Tip: name the most common answer.");
  assert.equal(await page.$(".comb"), null, "no grid on a text round");
  await page.getByRole("button", { name: "Lock it in" }).click();
  await page.waitForSelector(".toast");
  assert.equal(await page.textContent(".toast"), "Type an answer first.");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the honeycomb: 100 cells, four reveal states, fill order", { skip }, async () => {
  const { ctx, page } = await newPhone();
  await page.goto(s.base);
  const counts = await page.evaluate(async () => {
    const { looksFor } = await import("/js/honeycomb.js");
    const tally = (a) => a.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
    return {
      guess: tally(looksFor({ mode: "guess", guess: 37 })),
      reveal: tally(looksFor({ mode: "reveal", guess: 30, real: 52 })),
      over: tally(looksFor({ mode: "reveal", guess: 70, real: 52 })),
      split: tally(looksFor({ mode: "revealSplit", guess: 40, real: 62 })),
      first: looksFor({ mode: "guess", guess: 1 })[0],
      length: looksFor({ mode: "guess", guess: 0 }).length,
    };
  });
  assert.equal(counts.length, 100);
  assert.deepEqual(counts.guess, { ring: 37, empty: 63 });
  assert.deepEqual(counts.reveal, { honey: 30, white: 22, empty: 48 });
  assert.deepEqual(counts.over, { honey: 52, ring: 18, empty: 30 });
  assert.deepEqual(counts.split, { honey: 40, white: 22, amber: 38 });
  assert.equal(counts.first, "ring");
  await ctx.close();
});
