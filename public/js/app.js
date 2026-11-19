// Honeydle client. Vanilla ES modules, no build step.
import { Honeycomb } from "./honeycomb.js";
import { MAX_SCORE, ROUNDS, beeForRound, formatPct, isRuby, tierByName } from "/shared/rules.js";

// ---------------------------------------------------------------- utilities
const $app = document.getElementById("app");
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};

function toast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2500);
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

function playerId() {
  let id = store.get("honeydle.player");
  if (!id || !/^u-[A-Za-z0-9_-]{12,64}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    id = "u-" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    store.set("honeydle.player", id);
  }
  return id;
}
const PLAYER = playerId();

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "x-player-id": PLAYER, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(data?.error || "Something went wrong."), { status: res.status });
  return data;
}

const BEE_SRC = (name) => `/img/bee-${name}.png`;
const ENTRANCE = { golden: "enter-burst", diamond: "enter-diamond", honey: "enter-splash", drop: "enter-pop", normal: "enter-pulse", thirsty: "enter-gentle", ruby: "enter-diamond" };

function fullDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// pixel-art icons as tiny SVGs
const ICON = {
  back: `<svg viewBox="0 0 7 7" fill="currentColor"><rect x="3" y="0" width="1" height="1"/><rect x="2" y="1" width="1" height="1"/><rect x="1" y="2" width="1" height="1"/><rect x="0" y="3" width="7" height="1"/><rect x="1" y="4" width="1" height="1"/><rect x="2" y="5" width="1" height="1"/><rect x="3" y="6" width="1" height="1"/></svg>`,
  help: `<svg viewBox="0 0 5 7" fill="currentColor"><rect x="1" y="0" width="3" height="1"/><rect x="0" y="1" width="1" height="1"/><rect x="4" y="1" width="1" height="2"/><rect x="3" y="3" width="1" height="1"/><rect x="2" y="4" width="1" height="1"/><rect x="2" y="6" width="1" height="1"/></svg>`,
};
const SPARKLE = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 5' shape-rendering='crispEdges'><rect x='2' y='0' width='1' height='5' fill='#fff'/><rect x='0' y='2' width='5' height='1' fill='#fff'/><rect x='2' y='2' width='1' height='1' fill='#bfe9ff'/></svg>")}`;
const pipSvg = (fill, ring) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 7' shape-rendering='crispEdges'><path d='M2 0h2v1h1v1h1v3h-1v1h-1v1h-2v-1h-1v-1h-1v-3h1v-1h1z' fill='${ring}'/><path d='M2 1h2v1h1v3h-1v1h-2v-1h-1v-3h1z' fill='${fill}'/></svg>`)}`;
const PIP = {
  future: pipSvg("#151515", "#2e2e2e"),
  now: pipSvg("#1a1a1a", "#ffd60a"),
  hot: pipSvg("#ffd60a", "#d9a300"),
  warm: pipSvg("#f3d27a", "#b8952f"),
  cold: pipSvg("#5a5a5a", "#3e3e3e"),
};
const pipFor = (r) => (r.points >= 135 ? PIP.hot : r.points >= 95 ? PIP.warm : PIP.cold);
const swatch = (color, ring) => h("img", { class: "sw", alt: "", src: pipSvg(color, ring || color) });

// ---------------------------------------------------------------- chrome
function wordmark() {
  return h("h1", { class: "wordmark" }, h("a", { href: "/", onclick: (e) => { e.preventDefault(); goHome(); }, "aria-label": "Honeydle — home" },
    "HONE", h("span", { class: "kY" }, "Y"), "D", h("span", { class: "kL" }, "L"), "E", h("span", { class: "dot" }, ".")));
}

function masthead({ compact = false, date, streak } = {}) {
  if (compact) {
    return h("header", { class: "masthead compact" },
      h("button", { class: "icon-btn", "aria-label": "Home", onclick: goHome, html: ICON.back }),
      wordmark(),
      h("button", { class: "icon-btn", "aria-label": "How to play", onclick: showHowTo, html: ICON.help }));
  }
  return h("header", { class: "masthead" },
    wordmark(),
    h("p", { class: "tagline" }, "How well do you know the world?"),
    date && h("p", { class: "dateline" }, fullDate(date), streak > 0 && h("span", { class: "chip" }, `🔥 ${streak}-day streak`)));
}

function footer() {
  return h("footer", { class: "footer" },
    h("button", { class: "linkbtn", onclick: showHowTo }, "How to play"),
    h("button", { class: "linkbtn", onclick: showYesterday }, "Yesterday's answers"));
}

function mount(screen) {
  $app.replaceChildren(screen);
  window.scrollTo(0, 0);
}

function loading() {
  mount(h("main", { class: "screen" }, masthead({ date: state.date }), h("p", { class: "loading" }, "Loading")));
}

// ---------------------------------------------------------------- state
const state = { date: null, stats: null, daily: null, play: null };

// ---------------------------------------------------------------- home
async function goHome() {
  closeOverlay();
  loading();
  try {
    const [stats, res, today] = await Promise.all([api("/stats"), api("/results"), api("/today")]);
    state.stats = stats; state.daily = res.play; state.date = today.date;
  } catch (err) {
    return mount(h("main", { class: "screen home" }, masthead(), h("div", { class: "card daily-card" },
      h("p", {}, err.message || "Couldn't reach the hive."), h("button", { class: "btn primary", onclick: goHome }, "Try again"))));
  }
  renderHome();
}

function renderHome() {
  const { stats, daily } = state;
  const fmt = (v) => (v == null ? "–" : String(v));
  const statCard = (v, l) => h("div", { class: "stat" }, h("span", { class: "v" }, fmt(v)), h("span", { class: "l" }, l));
  // the crew, worst to best — the score ladder made visible
  const crew = ["thirsty", "normal", "drop", "honey", "golden", "diamond", "ruby"];
  const parade = h("div", { class: "parade-wrap", "aria-hidden": "true" }, h("div", { class: "parade" },
    crew.map((b, i) => h("div", { class: `bee-slot ${b}`, style: `--i:${i}` },
      h("div", { class: "bee-fly" }, h("img", { src: `/img/bee-${b}-96.png`, srcset: `/img/bee-${b}-96.png 2x, /img/bee-${b}-144.png 3x`, alt: "", width: 44, height: 44, draggable: "false" })),
      h("span", { class: "bee-shadow" })))),
    h("div", { class: "parade-scale" }, h("span", {}, "Way off"), h("span", { class: "line" }), h("span", {}, "Bullseye")));

  let action;
  if (daily?.completed) {
    action = [
      h("p", { class: "done" }, "Done for today — ", h("b", {}, String(daily.score)), ` / ${MAX_SCORE}`),
      h("button", { class: "btn primary", onclick: () => renderResults(daily) }, "See my results"),
    ];
  } else {
    action = h("button", { class: "btn primary", onclick: () => startPlay("daily") }, daily ? "Resume today's Daily" : "Play today's Daily");
  }

  mount(h("main", { class: "screen home" },
    masthead({ date: state.date, streak: stats?.streak }),
    h("section", { class: "stats", "aria-label": "Your stats" },
      statCard(stats?.streak ?? 0, "Streak"), statCard(stats?.games ?? 0, "Games"), statCard(stats?.best, "Best"), statCard(stats?.avg, "Avg")),
    parade,
    h("section", { class: "card daily-card" },
      h("p", { class: "kicker" }, "Today's Daily · 7 rounds"),
      h("h2", {}, "Seven prompts, the same for everyone. One run a day."),
      action),
    h("button", { class: "btn ghost", onclick: () => startPlay("endless") }, "Endless practice"),
    footer()));
}

// ---------------------------------------------------------------- play
async function startPlay(mode) {
  loading();
  try {
    state.play = await api("/play", { method: "POST", body: { mode } });
  } catch (err) {
    toast(err.message);
    return goHome();
  }
  if (state.play.completed) return renderResults(state.play);
  renderRound();
}

function renderRound() {
  const play = state.play;
  const r = play.round;
  const q = play.questions[r];
  const screen = h("main", { class: "screen round" });
  const pips = h("div", { class: "pips", "aria-hidden": "true" },
    play.questions.map((_, i) => h("img", { class: "pip", alt: "", src: i < play.results.length ? pipFor(play.results[i]) : i === r ? PIP.now : PIP.future })));
  const head = h("div", { class: "round-head" },
    h("div", { class: "progress" }, h("span", { class: "label" }, `Round ${r + 1} of ${ROUNDS} · ${play.mode === "daily" ? "Daily" : "Endless"}`), pips),
    h("p", { class: "kicker" }, q.category),
    h("h2", { class: "question" }, q.text));
  screen.append(masthead({ compact: true }), head);
  mount(screen);

  if (q.kind === "text") buildTextRound(screen, q);
  else buildNumberRound(screen, q);
}

function lockButton(label = "Lock it in") {
  return h("button", { class: "btn primary", type: "submit" }, label);
}

function buildNumberRound(screen, q) {
  let value = 50;
  const big = h("div", { class: "bignum", "aria-live": "polite" });
  const combHost = h("div", { class: "comb" });
  const combWrap = h("div", { class: "comb-wrap" }, combHost);
  const slider = h("input", { type: "range", min: 0, max: 100, step: 1, value: 50, "aria-label": "Your guess, percent" });
  const typed = h("input", { class: "field", type: "text", inputmode: "decimal", value: "50", "aria-label": "Type your guess", autocomplete: "off", maxlength: 6 });
  const fineBtn = h("button", { class: "btn ghost small fine-btn", type: "button", hidden: true, onclick: () => openFineTune(value, (v) => setValue(v)) }, "Fine-tune hundredths");
  const form = h("form", { class: "controls pinnable" });

  screen.append(big, combWrap, form);
  const comb = new Honeycomb(combHost);

  function paint() {
    big.replaceChildren(formatPct(value), h("small", {}, "%"));
    comb.set({ mode: "guess", guess: value > 0 && value < 1 ? 1 : value }, `Your guess: ${formatPct(value)} percent`);
    fineBtn.hidden = !(value <= 1);
    slider.style.setProperty("--v", `${Math.round(value)}%`);
  }
  function setValue(v, from) {
    value = v;
    if (from !== "slider") slider.value = String(Math.round(v));
    if (from !== "typed") typed.value = formatPct(v).replace(/\.00$/, "");
    paint();
  }
  slider.addEventListener("input", () => setValue(Number(slider.value), "slider"));
  typed.addEventListener("input", () => {
    const raw = typed.value.trim().replace(",", ".");
    if (raw === "" || !/^\d*\.?\d*$/.test(raw)) return;
    let n = Number(raw);
    if (!Number.isFinite(n)) return;
    n = Math.min(100, Math.max(0, n));
    if (n >= 1) n = Math.round(n); else n = Math.round(n * 100) / 100;
    setValue(n, "typed");
  });
  typed.addEventListener("focus", () => typed.select());

  form.append(h("div", { class: "slider-row" }, slider, typed), fineBtn,
    h("p", { class: "hint" }, "Decimals only below 1% — slide to 1 or under, then fine-tune."), lockButton());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const out = await api(`/play/${state.play.id}/submit`, { method: "POST", body: { round: state.play.round, value } });
      state.play = out.play;
      form.remove();
      showNumberReveal(screen, out.result, comb, big);
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
      if (err.status === 409 || err.status === 404) startPlay(state.play.mode);
    }
  });
  paint();
}

function buildTextRound(screen, q) {
  const input = h("input", { class: "field text", type: "text", placeholder: "Your answer", "aria-label": "Your answer", autocomplete: "off", autocapitalize: "sentences", spellcheck: "false", maxlength: 80, enterkeyhint: "go" });
  const form = h("form", { class: "controls text-controls" }, input, h("p", { class: "hint" }, "Tip: name the most common answer."), lockButton());
  screen.append(form);
  setTimeout(() => input.focus({ preventScroll: true }), 50);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { toast("Type an answer first."); input.focus(); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const out = await api(`/play/${state.play.id}/submit`, { method: "POST", body: { round: state.play.round, value: input.value } });
      state.play = out.play;
      form.remove();
      showTextReveal(screen, out.result);
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
      if (err.status === 409 || err.status === 404) startPlay(state.play.mode);
    }
  });
}

// ---------------------------------------------------------------- reveal
function heroFor(result, { center = false, line = null } = {}) {
  // the round that finishes the run may hand over to the ruby bee
  const bee = beeForRound(result.points, { finalScore: state.play.completed ? state.play.score : null });
  const hero = h("div", { class: `hero ${center ? "center" : ""} ${ENTRANCE[bee]}` });
  const img = h("img", { class: "bee", src: BEE_SRC(bee), alt: `${bee} bee`, width: 112, height: 112 });
  const beeBox = h("div", { style: "position:relative" }, img);
  if (bee === "diamond" || bee === "golden" || bee === "ruby") {
    [[-4, 8], [96, 18], [88, 92]].slice(0, bee === "golden" ? 2 : 3).forEach(([x, y], i) =>
      beeBox.append(h("img", { class: "sparkle", src: SPARKLE, alt: "", style: `left:${x}px;top:${y}px;animation-delay:${i * 0.35}s` })));
  }
  const words = h("div", {},
    h("p", { class: "tier" }, result.tier),
    h("p", { class: "pts" }, `+${result.points}`, h("small", {}, "points")),
    line,
    bee === "ruby" ? h("span", { class: "chip ruby-chip" }, "Over 1,000 — a ruby run!")
      : result.tier === "One Off" && h("span", { class: "chip" }, "One away — so close to a Bullseye."));
  hero.append(beeBox, words);
  return hero;
}

function nextButton() {
  const last = state.play.completed;
  return h("button", { class: "btn primary", onclick: () => (last ? renderResults(state.play) : renderRound()) }, last ? "See my score" : "Next round");
}

function showNumberReveal(screen, result, comb, big) {
  const zoom = result.answer < 1 && result.guess <= 1;
  const cells = (v) => (zoom ? Math.round(v * 100) : v > 0 && v < 1 ? 1 : Math.round(v));
  const reveal = h("section", { class: "reveal", "aria-live": "polite" });
  big.replaceChildren(formatPct(result.answer), h("small", {}, "%"));
  comb.reveal({ mode: "reveal", guess: cells(result.guess), real: cells(result.answer) },
    `The real number is ${formatPct(result.answer)} percent. You guessed ${formatPct(result.guess)}.`);
  const legend = h("div", { class: "legend" },
    h("span", { class: "chip" }, swatch("#ffffff"), "White = the real number"),
    h("span", { class: "chip" }, swatch("#ffd60a"), "Yellow = you got these"),
    h("span", { class: "chip" }, swatch("#1a1a1a", "#ffd60a"), "Yellow ring = your guess only"));
  if (zoom) comb.host.parentElement.append(h("span", { class: "comb-scale" }, "Zoomed · each cell = 0.01%"));
  const line = h("p", { class: "answer-line" }, `You guessed `, h("b", {}, `${formatPct(result.guess)}%`), ` · the real number is `, h("b", {}, `${formatPct(result.answer)}%`));
  reveal.append(...[heroFor(result, { line }), result.note ? h("p", { class: "note" }, result.note) : null, legend, nextButton()].filter(Boolean));
  screen.append(reveal);
  reveal.querySelector(".btn").focus({ preventScroll: true });
}

function showTextReveal(screen, result) {
  const said = result.guess || "—";
  const rankBit = result.rank ? ` · #${result.rank}` : " · not on the list";
  const reveal = h("section", { class: "reveal text-reveal", "aria-live": "polite" },
    heroFor(result, { center: true }),
    h("p", { class: "answer-line", style: "text-align:center" }, "You said: ", h("b", {}, said), rankBit,
      result.readBack ? h("span", {}, " · read as ", h("b", {}, result.readBack)) : null),
    nextButton());
  screen.append(reveal);
  reveal.querySelector(".btn").focus({ preventScroll: true });
}

// ---------------------------------------------------------------- results
function renderResults(play) {
  const ruby = isRuby(play.score, play.completed);
  const hero = h("section", { class: "results-hero" },
    ruby && h("div", { class: "enter-diamond" }, h("p", { class: "ruby-label" }, "RUBY"), h("img", { src: BEE_SRC("ruby"), alt: "Ruby bee", width: 120, height: 120 })),
    h("p", { class: "total" }, String(play.score)),
    h("p", { class: "outof" }, `out of ${MAX_SCORE}`));
  const rows = h("section", { class: "card rows", "aria-label": "Your rounds" },
    play.results.map((r, i) => {
      const bee = tierByName(r.tier)?.bee || "thirsty"; // by tier name, so older plays map too
      return h("div", { class: "row" },
        h("span", { class: "n" }, i + 1),
        h("div", {}, h("span", { class: "q" }, play.questions[i].text), h("span", { class: "t" }, r.tier)),
        h("img", { class: "row-bee", src: `/img/bee-${bee}-96.png`, alt: `${bee} bee`, width: 36, height: 36 }),
        h("span", { class: "p" }, r.points));
    }));
  const actions = h("div", { class: "actions" });
  if (play.mode === "daily") actions.append(h("button", { class: "btn primary", onclick: () => share(play.date) }, "Share my score"));
  else actions.append(h("button", { class: "btn primary", onclick: () => startPlay("endless") }, "Play again"));
  actions.append(h("button", { class: "btn ghost", onclick: goHome }, "Home"));
  mount(h("main", { class: "screen results" }, masthead({ date: state.date || play.date }), hero, rows, actions, footer()));
}

async function share(date) {
  try {
    const { text } = await api(`/share?date=${date}`);
    const full = `${text}\n\nPlay Honeydle — How well do you know the world?\n${location.origin}`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ text: full }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    await navigator.clipboard.writeText(full);
    toast("Share card copied.");
  } catch (err) {
    toast(err.message || "Couldn't copy the share card.");
  }
}

// ---------------------------------------------------------------- overlays
let overlayCleanup = null;
function openOverlay(title, body, { label } = {}) {
  closeOverlay();
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": label || title }, h("h2", {}, title), body);
  const scrim = h("div", { class: "scrim", onclick: (e) => { if (e.target === scrim) closeOverlay(); } }, sheet);
  const onKey = (e) => { if (e.key === "Escape") closeOverlay(); };
  document.addEventListener("keydown", onKey);
  const prevFocus = document.activeElement;
  document.body.append(scrim);
  overlayCleanup = () => { document.removeEventListener("keydown", onKey); scrim.remove(); prevFocus?.focus?.({ preventScroll: true }); };
  sheet.querySelector("button, input")?.focus({ preventScroll: true });
  return sheet;
}
function closeOverlay() { overlayCleanup?.(); overlayCleanup = null; }

function showHowTo() {
  openOverlay("How to play", h("div", {},
    h("p", {}, h("b", {}, "Daily. "), "One set of seven prompts, the same for everyone, one run a day. Every answer is a real published statistic."),
    h("p", {}, h("b", {}, "Guess the %. "), "Slide or type your guess. Under 1%, Fine-tune works in hundredths."),
    h("p", {}, h("b", {}, "Name the #1. "), "Type the most popular answer on a ranked list."),
    h("p", {}, "The closer your guess, the more points. A perfect guess is a Bullseye."),
    h("button", { class: "btn primary", onclick: closeOverlay }, "Got it")));
}

function openFineTune(start, onOk) {
  let v = Math.min(100, Math.max(1, Math.round((start <= 1 ? start : 1) * 100)));
  const val = h("div", { class: "fine-value", "aria-live": "polite" });
  const host = h("div", { class: "comb" });
  const slider = h("input", { type: "range", min: 1, max: 100, step: 1, value: v, "aria-label": "Hundredths of a percent" });
  const sheet = openOverlay("Fine-tune", h("div", {},
    h("p", { style: "text-align:center" }, "Hundredths — each cell is 0.01%."),
    val, host, slider,
    h("div", { class: "btn-row" },
      h("button", { class: "btn ghost", onclick: closeOverlay }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => { closeOverlay(); onOk(v / 100); } }, "OK"))));
  const comb = new Honeycomb(host);
  const paint = () => {
    val.textContent = `${(v / 100).toFixed(2)}%`;
    slider.style.setProperty("--v", `${v}%`);
    comb.set({ mode: "fine", value: v }, `${(v / 100).toFixed(2)} percent`);
  };
  slider.addEventListener("input", () => { v = Number(slider.value); paint(); });
  paint();
  void sheet;
}

async function showYesterday() {
  const body = h("div", {}, h("p", { class: "loading" }, "Loading"));
  openOverlay("Yesterday's answers", body);
  try {
    const y = await api("/yesterday");
    body.replaceChildren(
      h("p", {}, fullDate(y.date)),
      ...y.rounds.map((q, i) => h("div", { class: "y-row" },
        h("div", { class: "k" }, `Round ${i + 1} · ${q.category}`),
        h("div", { class: "qq" }, q.text),
        q.kind === "text"
          ? h("div", { class: "a" }, `#1 ${q.top1}`)
          : h("div", { class: "a" }, `${formatPct(q.answer)}%`),
        q.source && h("div", { class: "src" }, q.sourceUrl ? h("a", { href: q.sourceUrl, target: "_blank", rel: "noopener" }, q.source) : q.source))),
      h("button", { class: "btn primary", onclick: closeOverlay }, "Close"));
  } catch (err) {
    body.replaceChildren(h("p", {}, err.message), h("button", { class: "btn primary", onclick: closeOverlay }, "Close"));
  }
}

// ---------------------------------------------------------------- boot
goHome();
