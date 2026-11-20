// Browser checks with Playwright against the real app: a full Daily on a
// 390 × 844 phone, the one-screen rule, secrecy in the DOM, fine-tune,
// resume, results, share, overlays and the narrow-phone layout.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer, bank, secretsFor } from "./harness.js";
import { composeSet } from "../src/game/index.js";

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
const WORST_CASE_SET = [186, 170, 249, 173, 260, 189, 78];

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
      await page.fill("input.field.text", r === 2 ? q.top1 : q.textAnswers.at(-1).texts[0]); // #1, then the lowest-ranked real answer
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
      if (r === 5) assert.match(revealText, new RegExp(`#${q.textAnswers.at(-1).rank}`));
      assert.equal(await page.locator(".top3 li").count(), 3, "the top 3 are shown");
      assert.match(revealText, new RegExp(q.top1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const bee = await page.$eval(".hero img.bee", (img) => ({ src: img.getAttribute("src"), rendering: getComputedStyle(img).imageRendering }));
    assert.equal(bee.rendering, "pixelated");
    if (r < 6 && r !== 5) assert.match(bee.src, /diamond/, `round ${r + 1}: a Bullseye is the diamond bee`);
    if (r === 5) assert.match(bee.src, /thirsty/, "a low-ranked text answer is the thirsty bee");
    if (r === 6) assert.match(bee.src, /ruby/, "the answer that takes the run to 800+ is the ruby bee");
    await page.getByRole("button", { name: r === 6 ? "See my score" : "Next round" }).click();
  }

  await page.waitForSelector(".total");
  const total = Number(await page.textContent(".total"));
  assert.ok(total >= 800);
  assert.ok(await page.isVisible(".ruby-label"), "800+ shows the ruby bee on results");
  assert.doesNotMatch(await page.textContent(".results-hero"), /1225/, "the max score is never shown");
  assert.equal(await page.locator(".row").count(), 7);
  void secrets;

  // share: clipboard path on a non-touch browser
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: s.base });
  await page.getByRole("button", { name: "Share my score" }).click();
  await page.waitForSelector(".toast");
  assert.equal(await page.textContent(".toast"), "Share card copied.");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^Honeydle 2026-11-19\n.+\n🍯 \d+\n\nPlay Honeydle — How well do you know the world\?/u);

  // home now shows "Done for today"
  await page.getByRole("button", { name: "Home" }).click();
  await page.waitForSelector(".daily-card .done");
  assert.match(await page.textContent(".daily-card .done"), new RegExp(`${total} points of honey`));
  assert.match(await page.textContent(".daily-card .countdown"), /^Next Daily in \d+:\d{2}:\d{2}$/, "countdown to the next Daily");
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
  await page.getByRole("button", { name: "Play today's Daily" }).click();
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
  await page.getByRole("button", { name: "Play today's Daily" }).click();
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
      first: looksFor({ mode: "guess", guess: 1 })[0],
      length: looksFor({ mode: "guess", guess: 0 }).length,
    };
  });
  assert.equal(counts.length, 100);
  assert.deepEqual(counts.guess, { ring: 37, empty: 63 });
  assert.deepEqual(counts.reveal, { honey: 30, white: 22, empty: 48 });
  assert.deepEqual(counts.over, { honey: 52, ring: 18, empty: 30 });
  assert.equal(counts.first, "ring");
  await ctx.close();
});

test("home parade: the bee crew runs worst to best", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.waitForSelector(".parade .bee-slot");
  const crew = await page.$$eval(".parade .bee-slot", (els) => els.map((e) => e.className.replace("bee-slot ", "")));
  assert.deepEqual(crew, ["thirsty", "normal", "drop", "honey", "golden", "diamond"]);
  assert.ok(await page.isVisible(".mystery .mystery-bee"), "the ruby bee sits apart from the crew");
  assert.equal(await page.$(".mystery-box"), null, "no box around it");
  const [beeBox, qBox] = await Promise.all([page.locator(".mystery-bee").boundingBox(), page.locator(".mystery-q").boundingBox()]);
  assert.ok(qBox.y > beeBox.y + beeBox.height - 2, "one pixel question mark below it");
  assert.doesNotMatch(await page.textContent("main"), /1225/, "the max score is never shown");
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** Starts the Daily (a fresh player each test) and plays the two Guess rounds, leaving the page on the first text round. */
async function toTextRound(page) {
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  for (let r = 0; r < 2; r++) {
    await page.waitForSelector(".question");
    await page.getByRole("button", { name: "Lock it in" }).click();
    await page.getByRole("button", { name: "Next round" }).click();
  }
  await page.waitForSelector("input.field.text");
}

test("text rounds: unlisted answers are refused, near misses are corrected in the box first", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await toTextRound(page);
  assert.equal(await page.textContent(".timer-num"), "0:25", "text rounds get 25 seconds");
  // not on the list: refused, the round stays open
  await page.fill("input.field.text", "qwertyuiop");
  await page.press("input.field.text", "Enter");
  await page.waitForSelector(".hint.refuse");
  assert.match(await page.textContent(".hint"), /not on the list/);
  assert.equal(await page.$(".reveal"), null, "nothing is scored");
  // a typo of a real answer: corrected in the box, not submitted
  const playId = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("honeydle.timer."))?.split(".")[2]);
  const play = await s.store.getPlay(playId);
  const q = play.snapshot[2];
  const label = q.textAnswers[0].texts[0];
  const typo = label.slice(0, 2) + label.slice(3); // drop the third letter: a typo, never the answer itself
  assert.notEqual(typo.toLowerCase(), label.toLowerCase());
  await page.fill("input.field.text", typo);
  await page.press("input.field.text", "Enter");
  await page.waitForSelector(".hint.suggest");
  assert.equal(await page.inputValue("input.field.text"), label, "the box now holds the real answer");
  assert.equal(await page.$(".reveal"), null, "not submitted until Enter again");
  // Enter again locks it in
  await page.press("input.field.text", "Enter");
  await page.waitForSelector(".reveal .tier");
  assert.equal(await page.textContent(".reveal .tier"), "Bullseye");
  assert.equal(await page.locator(".top3 li.you").count(), 1, "your answer is highlighted in the top 3");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("timer: 15 seconds to guess, then whatever you have is locked in", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.clock.install();
  await page.goto(s.base);
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  await page.waitForSelector(".timer-num");
  assert.equal(await page.textContent(".timer-num"), "0:15");
  await page.$eval("input[type=range]", (el) => { el.value = "37"; el.dispatchEvent(new Event("input")); });
  await page.clock.runFor(6_000);
  assert.match(await page.getAttribute(".timer", "class"), /low/, "turns orange under 10 seconds");
  await page.clock.runFor(10_000); // past 15s
  await page.waitForSelector(".reveal .tier");
  assert.match(await page.textContent(".reveal"), /Time's up/);
  assert.match(await page.textContent(".reveal .answer-line"), /You guessed 37%/, "the slider value was locked in");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("honey jar: fills with the score during the run and on the results", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await page.getByRole("button", { name: "Play today's Daily" }).click();
  await page.waitForSelector(".jar-slot canvas.jar");
  assert.match(await page.getAttribute(".jar-slot canvas", "aria-label"), /^0 points of honey/);
  await page.getByRole("button", { name: "Lock it in" }).click();
  await page.waitForSelector(".jar-plus");
  assert.match(await page.textContent(".jar-plus"), /^\+\d+$/);
  const label = await page.getAttribute(".jar-slot canvas", "aria-label");
  const pts = Number(label.match(/^(\d+)/)[1]);
  assert.ok(pts > 0, "honey went in");
  assert.equal(await page.$eval(".jar-slot canvas", (c) => getComputedStyle(c).imageRendering), "pixelated");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("text rounds: a group name gets a \"Which one?\" hint and keeps the text", { skip }, async () => {
  const { ctx, page, errors } = await newPhone();
  await page.goto(s.base);
  await toTextRound(page);
  const playId = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("honeydle.timer."))?.split(".")[2]);
  // put the movie question into this round
  const play = await s.store.getPlay(playId);
  play.snapshot[2] = bank.find((q) => q.id === 236);
  play.questionIds[2] = 236;
  await s.store.savePlay(play);
  await page.fill("input.field.text", "star wars");
  await page.press("input.field.text", "Enter");
  await page.waitForSelector(".hint.which");
  assert.match(await page.textContent(".hint"), /^Which one\?/);
  assert.equal(await page.inputValue("input.field.text"), "star wars", "text kept so they can add to it");
  assert.equal(await page.$(".reveal"), null);
  await page.fill("input.field.text", "star wars the force awakens");
  await page.press("input.field.text", "Enter");
  await page.waitForSelector(".reveal .tier");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("past games: the home button opens the list and a past Daily plays like the real one", { skip }, async () => {
  const t = await startServer({ at: "2026-11-21T15:00:00Z" });
  try {
    await t.store.putDailySet("2026-11-19", [183, 271, 191, 280, 279, 236, 301]);
    await t.store.putDailySet("2026-11-20", composeSet(bank, "ui:20"));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(t.base);
    assert.equal(await page.getByRole("button", { name: "Endless practice" }).count(), 0, "Endless is gone");
    await page.getByRole("button", { name: "Past games" }).click();
    await page.waitForSelector(".pg-row");
    assert.deepEqual(await page.$$eval(".pg-num", (els) => els.map((e) => e.textContent)), ["#7", "#6"]);
    await page.locator(".pg-row").nth(1).click();
    await page.waitForSelector(".question");
    assert.match(await page.textContent(".progress .label"), /Past game #6/);
    assert.match(await page.textContent(".question"), /Black Death/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await t.close(); }
});
