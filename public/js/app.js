// Honeydle client. Vanilla ES modules, no build step.
import { Honeycomb } from "./honeycomb.js";
import { HoneyJar } from "./jar.js";
import { GUESS_SECONDS, JAR_FULL, ROUNDS, TEXT_SECONDS, beeForRound, formatPct, isRuby, secondsFor, tierByName } from "./rules.js";

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
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode: fine */ } },
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
  if (!res.ok) throw Object.assign(new Error(data?.error || "Something went wrong."), { status: res.status, code: data?.code });
  return data;
}

const BEE_SRC = (name) => `/img/bee-${name}.png`;
const ENTRANCE = { golden: "enter-burst", diamond: "enter-diamond", honey: "enter-splash", lukewarm: "enter-gentle", bitter: "enter-gentle", yucky: "enter-gentle", normal: "enter-pulse", thirsty: "enter-gentle", ruby: "enter-diamond" };

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
// a chunky pixel question mark (7×11) that clouds over the hidden ruby bee
const QMARK = `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 11' shape-rendering='crispEdges'>"
  + "<path d='M1 1h1V0h3v1h1v1h1v3H6v1H5v1H3V5h1V4h1V2H2v1H0V1h1z' fill='#000' opacity='.55' transform='translate(.5 .5)'/>"
  + "<path d='M1 1h1V0h3v1h1v1h1v3H6v1H5v1H3V5h1V4h1V2H2v1H0V1h1zM3 8h2v2H3z' fill='#ff5c7a'/>"
  + "<path d='M2 0h3v1H2zM1 1h1v1H1z' fill='#ffc2cf'/></svg>")}`;
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
    "HONE", h("span", { class: "kY" }, "Y"), "D", h("span", { class: "kL" }, "L"), "E"));
}

function masthead({ compact = false, date, streak } = {}) {
  if (compact) {
    return h("header", { class: "masthead compact" },
      h("button", { class: "icon-btn", "aria-label": "Home", onclick: goHome, html: ICON.back }),
      wordmark(),
      h("div", { class: "jar-slot" }));
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
    const [stats, res, today, hunt] = await Promise.all([api("/stats"), api("/results"), api("/today"), api("/hunt").catch(() => null)]);
    state.stats = stats; state.daily = res.play; state.date = today.date; state.hunt = hunt;
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
  // the crew, worst to best — and, apart from them, the hidden ruby bee
  const crew = ["yucky", "bitter", "lukewarm", "honey", "golden", "diamond"];
  const parade = h("div", { class: "parade-wrap", "aria-hidden": "true" }, h("div", { class: "parade" },
    crew.map((b, i) => h("div", { class: `bee-slot ${b}`, style: `--i:${i}` },
      h("div", { class: "bee-fly" }, h("img", { src: `/img/bee-${b}-96.png`, srcset: `/img/bee-${b}-96.png 2x, /img/bee-${b}-144.png 3x`, alt: "", width: 44, height: 44, draggable: "false" })),
      h("span", { class: "bee-shadow" })))));
  const mystery = h("div", { class: "mystery", "aria-label": "The ruby bee — a hidden prize only pros find.", role: "img" },
    h("div", { class: "bee-fly mystery-fly" },
      h("img", { class: "mystery-bee", src: "/img/bee-ruby-shadow-96.png", srcset: "/img/bee-ruby-shadow-96.png 2x, /img/bee-ruby-shadow-144.png 3x", alt: "", width: 48, height: 48, draggable: "false" })),
    h("img", { class: "mystery-q", src: QMARK, alt: "" }));
  const crewRow = h("div", { class: "crew-row" }, parade, mystery);

  let action;
  if (daily?.completed) {
    action = [
      h("p", { class: "done" }, "Done for today — ", h("b", {}, String(daily.score)), " points of honey"),
      countdown(),
      h("button", { class: "btn primary", onclick: () => renderResults(daily) }, "See my results"),
    ];
  } else {
    action = h("button", { class: "btn primary", onclick: () => startPlay("daily") }, daily ? "Resume today's Daily" : "Play today's Daily");
  }

  mount(h("main", { class: "screen home" },
    masthead({ date: state.date, streak: stats?.streak }),
    h("section", { class: "stats", "aria-label": "Your stats" },
      statCard(stats?.streak ?? 0, "Streak"), statCard(stats?.games ?? 0, "Games"), statCard(stats?.best, "Best"), statCard(stats?.avg, "Avg")),
    crewRow,
    h("section", { class: "card daily-card" },
      h("p", { class: "kicker" }, "Today's Daily · 7 rounds"),
      h("h2", {}, "Seven prompts, the same for everyone. One run a day."),
      action,
      h("button", { class: "btn ghost past-btn", onclick: renderArchive }, "Past games")),
    state.hunt && huntCard(state.hunt),
    footer()));
}

// ---------------------------------------------------------------- hive hunt
const HEX = { empty: pipSvg("#151515", "#2e2e2e"), found: pipSvg("#ffd60a", "#d9a300"), missed: pipSvg("#3a3020", "#5a4a20") };

/** The bonus card on the home screen. */
function huntCard(hunt) {
  const done = hunt.status === "done";
  return h("section", { class: "card hunt-card" },
    h("p", { class: "kicker" }, h("b", {}, "Bonus"), ` · Hive Hunt #${hunt.number}`),
    h("p", { class: "hunt-prompt" }, hunt.prompt || "Start the hunt to find out today's list!"),
    done
      ? h("p", { class: "done" }, "You found ", h("b", {}, `${hunt.score} of ${hunt.total}`), ".")
      : h("p", { class: "hint", style: "text-align:left" }, `${hunt.seconds} seconds — name as many as you can.`),
    h("button", { class: `btn ${done ? "ghost" : "primary"} small`, onclick: () => openHunt() }, done ? "See the hunt" : hunt.status === "playing" ? "Back to the hunt" : "Start the hunt"));
}

/** A honeycomb with one cell per list entry, rows of up to 10, nested like the main comb. */
function huntComb(total, found, missed = 0) {
  const cols = Math.min(10, total);
  const rows = [];
  for (let i = 0; i < total; i += cols) {
    const row = h("div", { class: "hc-row" });
    for (let j = i; j < Math.min(total, i + cols); j++) {
      const look = j < found ? "found" : j < found + missed ? "missed" : "empty";
      row.append(h("img", { class: `hc-cell ${look}`, src: HEX[look], alt: "" }));
    }
    rows.push(row);
  }
  return h("div", { class: "hunt-comb", role: "img", "aria-label": `${found} of ${total} found` }, rows);
}

async function openHunt() {
  closeOverlay();
  loading();
  try {
    state.hunt = await api("/hunt");
  } catch (err) {
    toast(err.message);
    return goHome();
  }
  if (state.hunt.status === "done") return renderHuntResults(state.hunt);
  renderHunt();
}

function renderHunt() {
  const hunt = state.hunt;
  const screen = h("main", { class: "screen hunt" });
  const top = masthead({ compact: true });
  top.querySelector(".jar-slot")?.remove();
  const count = h("div", { class: "bignum hunt-count" });
  const combHost = h("div", { class: "hunt-comb-host" });
  const chips = h("div", { class: "hunt-found" });
  const paint = () => {
    count.replaceChildren(String(hunt.found.length), h("small", {}, ` / ${hunt.total}`));
    combHost.replaceChildren(huntComb(hunt.total, hunt.found.length));
    chips.replaceChildren(...[...hunt.found].reverse().map((l) => h("span", { class: "chip" }, l)));
  };
  screen.append(top,
    h("div", { class: "round-head" },
      h("p", { class: "kicker" }, h("b", {}, "Hive Hunt"), ` #${hunt.number}`),
      h("h2", { class: "question" }, hunt.prompt || "Start the hunt to find out today's list!")),
    count, combHost);
  if (hunt.total) paint();
  else combHost.replaceChildren(h("img", { class: "hunt-mystery", src: QMARK, alt: "" }));

  if (hunt.status === "new") {
    screen.append(h("section", { class: "controls" },
      h("p", { class: "hint" }, `You get ${hunt.seconds} seconds: type an answer and press Enter — then the next. Typos are fine.`),
      h("button", { class: "btn primary", onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { state.hunt = await api("/hunt/start", { method: "POST", body: {} }); } catch (err) { toast(err.message); return; }
        renderHunt();
      } }, "Start the hunt")));
    mount(screen);
    return;
  }

  // playing: the clock (server-backed), the input and live feedback
  const bar = h("span", { class: "timer-fill" });
  const num = h("span", { class: "timer-num" });
  const timer = h("div", { class: "timer", role: "timer" }, h("span", { class: "timer-track" }, bar), num);
  const input = h("input", { class: "field text", type: "text", placeholder: "Type and press Enter", "aria-label": "Your answer", autocomplete: "off", autocapitalize: "words", spellcheck: "false", maxlength: 60, enterkeyhint: "send" });
  const feedback = h("p", { class: "hint hunt-feedback", "aria-live": "polite" }, " ");
  const enter = h("button", { class: "btn primary hunt-enter", type: "submit", "aria-label": "Enter answer" }, "Enter");
  const form = h("form", { class: "controls text-controls" }, h("div", { class: "hunt-entry" }, input, enter), feedback);
  screen.append(timer, form, chips, h("button", { class: "linkbtn hunt-giveup", onclick: () => end() }, "I'm done — end the hunt"));
  mount(screen);
  setTimeout(() => input.focus({ preventScroll: true }), 50);

  const endsAt = Date.now() + hunt.secondsLeft * 1000;
  let over = false;
  const tick = setInterval(() => {
    const left = Math.max(0, endsAt - Date.now());
    const secs = Math.ceil(left / 1000);
    num.textContent = `0:${String(secs).padStart(2, "0")}`;
    bar.style.width = `${(left / (hunt.seconds * 1000)) * 100}%`;
    timer.classList.toggle("low", secs <= 10);
    timer.classList.toggle("critical", secs <= 5);
    if (left <= 0) end();
  }, 100);

  async function end() {
    if (over) return;
    over = true;
    clearInterval(tick);
    input.disabled = true;
    try { state.hunt = await api("/hunt/finish", { method: "POST", body: {} }); } catch (err) { toast(err.message); }
    renderHuntResults(state.hunt);
  }

  const say = (text, kind) => { feedback.textContent = text; feedback.className = `hint hunt-feedback ${kind}`; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    input.focus({ preventScroll: true }); // tapping the Enter button keeps the keyboard up
    if (!value || over) return;
    input.value = "";
    let out;
    try { out = await api("/hunt/guess", { method: "POST", body: { value } }); } catch (err) { toast(err.message); return; }
    if (out.result === "found") {
      state.hunt = out.hunt;
      hunt.found = out.hunt.found;
      paint();
      const cells = combHost.querySelectorAll(".hc-cell.found");
      cells[cells.length - 1]?.classList.add("pop");
      say(`✓ ${out.label}`, "good");
      if (out.hunt.status === "done") end();
    } else if (out.result === "already") {
      say(`Already got ${out.label}.`, "");
    } else if (out.result === "ambiguous") {
      say(`Which one? ${out.count >= 2 ? `${out.count} answers fit` : "More than one answer fits"} “${value}”.`, "which");
    } else if (out.result === "over") {
      state.hunt = out.hunt; end();
    } else {
      input.classList.remove("refused"); void input.offsetWidth; input.classList.add("refused");
      say(`“${value}” isn't on this list.`, "refuse");
    }
  });
}

function huntBee(score, total) {
  const f = total ? score / total : 0;
  return f >= 0.9 ? "diamond" : f >= 0.7 ? "golden" : f >= 0.5 ? "honey" : f >= 0.3 ? "lukewarm" : f >= 0.15 ? "bitter" : "yucky";
}

function renderHuntResults(hunt) {
  const bee = huntBee(hunt.score, hunt.total);
  const top = masthead({ compact: true });
  top.querySelector(".jar-slot")?.remove();
  const missed = hunt.missed || [];
  mount(h("main", { class: "screen hunt" }, top,
    h("section", { class: "results-hero hunt-hero" },
      h("p", { class: "kicker" }, h("b", {}, "Hive Hunt"), ` #${hunt.number}`),
      h("img", { class: `hunt-bee ${ENTRANCE[bee]}`, src: BEE_SRC(bee), alt: `${bee} bee`, width: 112, height: 112 }),
      h("p", { class: "total" }, String(hunt.score), h("small", { class: "of" }, ` / ${hunt.total}`)),
      h("p", { class: "outof" }, "found"),
      h("p", { class: "hunt-prompt" }, hunt.prompt)),
    huntComb(hunt.total, hunt.score, missed.length),
    h("section", { class: "card hunt-lists" },
      h("p", { class: "kicker" }, `You found ${hunt.score}`),
      h("div", { class: "hunt-found" }, hunt.found.map((l) => h("span", { class: "chip" }, l))),
      missed.length ? h("p", { class: "kicker", style: "margin-top:12px" }, `You missed ${missed.length}`) : h("p", { class: "done" }, "You got every one!"),
      h("div", { class: "hunt-found missed" }, missed.map((l) => h("span", { class: "chip" }, l))),
      hunt.source && h("p", { class: "src" }, hunt.source)),
    h("div", { class: "actions" },
      h("button", { class: "btn primary", onclick: () => shareHunt(hunt) }, "Share my hunt"),
      h("button", { class: "btn ghost", onclick: goHome }, "Home")),
    countdown()));
}

async function shareHunt(hunt) {
  const text = `Honeydle Hive Hunt #${hunt.number}\n🐝 ${hunt.score}/${hunt.total} — ${hunt.prompt}\n${location.origin}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    await navigator.clipboard.writeText(text);
    toast("Hunt copied.");
  } catch { toast("Couldn't copy the hunt."); }
}

// ---------------------------------------------------------------- past games
async function renderArchive() {
  closeOverlay();
  loading();
  let data;
  try {
    data = await api("/archive");
  } catch (err) {
    toast(err.message);
    return goHome();
  }
  const shortDate = (d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  };
  const rows = data.games.map((g) => {
    const status = g.status === "done"
      ? h("span", { class: "pg-score" }, String(g.score), h("small", {}, " honey"))
      : h("span", { class: "chip" }, g.status === "playing" ? "Resume" : "Play");
    return h("button", { class: `pg-row ${g.status}`, onclick: () => startPlay("archive", g.date), "aria-label": `Honeydle #${g.number}, ${shortDate(g.date)}` },
      h("span", { class: "pg-num" }, `#${g.number}`),
      h("span", { class: "pg-date" }, shortDate(g.date), g.playedAs === "daily" ? h("small", {}, "played on the day") : null),
      status);
  });
  mount(h("main", { class: "screen archive" },
    masthead({ compact: true }),
    h("div", {},
      h("p", { class: "kicker" }, "Past games"),
      h("h2", { class: "pg-title" }, "Play any Daily you missed."),
      h("p", { class: "hint", style: "text-align:left" }, "Same seven questions everyone got that day. Past games don't count toward your streak.")),
    rows.length
      ? h("section", { class: "card pg-list" }, rows)
      : h("section", { class: "card daily-card" }, h("p", {}, "No past games yet — today's Daily is the first. Check back tomorrow!")),
    h("button", { class: "btn ghost", onclick: goHome }, "Home")));
  const jarSlot = $app.querySelector(".jar-slot");
  if (jarSlot) jarSlot.remove();
}

// ---------------------------------------------------------------- play
async function startPlay(mode, date) {
  loading();
  try {
    state.play = await api("/play", { method: "POST", body: { mode, date } });
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
  const timer = new RoundTimer(play.id, r, secondsFor(q.kind));
  const head = h("div", { class: "round-head" },
    h("div", { class: "progress" }, h("span", { class: "label" }, `Round ${r + 1} of ${ROUNDS} · ${play.mode === "daily" ? "Daily" : `Past game #${play.number}`}`), pips),
    timer.el,
    h("p", { class: "kicker" }, q.category),
    h("h2", { class: "question" }, q.text));
  const top = masthead({ compact: true });
  screen.append(top, head);
  mount(screen);
  // the score jar sits in the header and fills as the run goes
  const jar = new HoneyJar(top.querySelector(".jar-slot"), { scale: 2 });
  jar.fill(play.score / JAR_FULL, { animate: false, label: `${play.score} points of honey so far` });
  const round = { screen, q, timer, jar };
  if (q.kind === "text") buildTextRound(round);
  else buildNumberRound(round);
}

/**
 * The round timer: a pixel bar that drains over the round's seconds. The start
 * time is remembered per play and round, so a reload doesn't reset it.
 */
class RoundTimer {
  constructor(playId, round, seconds) {
    this.seconds = seconds;
    this.key = `honeydle.timer.${playId}.${round}`;
    this.bar = h("span", { class: "timer-fill" });
    this.num = h("span", { class: "timer-num" });
    this.el = h("div", { class: "timer", role: "timer", "aria-live": "off" }, h("span", { class: "timer-track" }, this.bar), this.num);
    this.tick = null;
  }
  start(onExpire) {
    let started = Number(store.get(this.key));
    if (!started) { started = Date.now(); store.set(this.key, String(started)); }
    const total = this.seconds * 1000;
    const update = () => {
      const left = Math.max(0, total - (Date.now() - started));
      const secs = Math.ceil(left / 1000);
      this.num.textContent = `0:${String(secs).padStart(2, "0")}`;
      this.bar.style.width = `${(secs / this.seconds) * 100}%`;
      this.el.classList.toggle("low", secs <= 10);
      this.el.classList.toggle("critical", secs <= 5);
      this.el.setAttribute("aria-label", `${secs} seconds left`);
      if (left <= 0) { this.stop(); onExpire(); }
    };
    update();
    if (this.num.textContent !== "0:00") this.tick = setInterval(update, 200);
  }
  stop({ clear = false } = {}) {
    clearInterval(this.tick);
    this.tick = null;
    if (clear) { store.remove(this.key); this.el.classList.add("stopped"); }
  }
}

function lockButton(label = "Lock it in") {
  return h("button", { class: "btn primary", type: "submit" }, label);
}

/** Pour this round's points into the jar with a little floating "+N". */
function pourIntoJar(jar, result) {
  jar.fill(state.play.score / JAR_FULL, { label: `${state.play.score} points of honey so far` });
  const slot = jar.cv.parentElement;
  const plus = h("span", { class: "jar-plus" }, `+${result.points}`);
  slot.append(plus);
  setTimeout(() => plus.remove(), 1400);
}

function buildNumberRound({ screen, q, timer, jar }) {
  let value = 50;
  let sent = false;
  const big = h("div", { class: "bignum", "aria-live": "polite" });
  const combHost = h("div", { class: "comb" });
  const combWrap = h("div", { class: "comb-wrap" }, combHost);
  const slider = h("input", { type: "range", min: 0, max: 100, step: 1, value: 50, "aria-label": "Your guess, percent" });
  const typed = h("input", { class: "field", type: "text", inputmode: "decimal", value: "50", "aria-label": "Type your guess", autocomplete: "off", maxlength: 6 });
  // "<1" switches the slider to hundredths (0.00–1.00); tap again for whole percents
  let sub1 = false;
  const subBtn = h("button", { class: "sub1-btn", type: "button", "aria-pressed": "false", "aria-label": "Under 1%: hundredths", title: "Under 1%", onclick: () => setSub(!sub1) }, "<1");
  function setSub(on) {
    sub1 = on;
    subBtn.setAttribute("aria-pressed", String(on));
    slider.setAttribute("aria-label", on ? "Your guess, hundredths of a percent" : "Your guess, percent");
    setValue(on ? (value < 1 ? value : 0.5) : Math.max(1, Math.round(value)));
  }
  const form = h("form", { class: "controls pinnable" });

  screen.append(big, combWrap, form);
  const comb = new Honeycomb(combHost);

  function paint() {
    big.replaceChildren(formatPct(value), h("small", {}, "%"));
    if (sub1) comb.set({ mode: "fine", value: Math.round(value * 100) }, `Your guess: ${formatPct(value)} percent`);
    else comb.set({ mode: "guess", guess: value > 0 && value < 1 ? 1 : value }, `Your guess: ${formatPct(value)} percent`);
    const pos = sub1 ? Math.round(value * 100) : Math.round(value);
    slider.style.setProperty("--v", `${pos}%`);
  }
  function setValue(v, from) {
    value = v;
    if (from === "typed" && sub1 !== (v < 1)) { sub1 = v < 1; subBtn.setAttribute("aria-pressed", String(sub1)); }
    if (from !== "slider") slider.value = String(sub1 ? Math.round(v * 100) : Math.round(v));
    if (from !== "typed") typed.value = formatPct(v).replace(/\.00$/, "");
    paint();
  }
  slider.addEventListener("input", () => setValue(sub1 ? Number(slider.value) / 100 : Number(slider.value), "slider"));
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

  form.append(h("div", { class: "slider-row" }, subBtn, slider, typed),
    h("p", { class: "hint" }, "Under 1%? Tap <1 to slide in hundredths."), lockButton());

  async function send({ timedOut = false } = {}) {
    if (sent) return;
    sent = true;
    timer.stop();
    if (timedOut) closeOverlay();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const out = await api(`/play/${state.play.id}/submit`, { method: "POST", body: { round: state.play.round, value, timedOut } });
      timer.stop({ clear: true });
      state.play = out.play;
      form.remove();
      showNumberReveal(screen, out.result, comb, big);
      pourIntoJar(jar, out.result);
    } catch (err) {
      sent = false;
      btn.disabled = false;
      toast(err.message);
      if (err.status === 409 || err.status === 404) startPlay(state.play.mode);
    }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
  paint();
  timer.start(() => send({ timedOut: true }));
}

function buildTextRound({ screen, q, timer, jar }) {
  const input = h("input", { class: "field text", type: "text", placeholder: "Your answer", "aria-label": "Your answer", autocomplete: "off", autocapitalize: "sentences", spellcheck: "false", maxlength: 80, enterkeyhint: "go" });
  const tip = q.hint || "Tip: name the most common answer.";
  const hint = h("p", { class: "hint", "aria-live": "polite" }, tip);
  const form = h("form", { class: "controls text-controls" }, input, hint, lockButton());
  screen.append(form);
  setTimeout(() => input.focus({ preventScroll: true }), 50);
  let sending = false;
  let done = false;

  const setHint = (text, kind = "") => { hint.textContent = text; hint.className = `hint ${kind}`; };
  input.addEventListener("input", () => {
    input.classList.remove("suggested", "refused");
    if (hint.classList.contains("suggest") || hint.classList.contains("refuse")) setHint(tip);
  });

  async function send({ timedOut = false } = {}) {
    if (done || (sending && !timedOut)) return;
    if (!timedOut && !input.value.trim()) { toast("Type an answer first."); input.focus(); return; }
    sending = true;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const out = await api(`/play/${state.play.id}/submit`, { method: "POST", body: { round: state.play.round, value: input.value, timedOut } });
      if (out.refused === "ambiguous") {
        // a group, not an answer ("whale", "star wars"): ask which one, keep the text to build on
        input.classList.remove("refused");
        setHint("", "which");
        hint.append(h("b", { class: "which-q" }, "Which one?"), " ", out.message.replace(/^Which one\?\s*/, ""));
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      if (out.refused) {
        input.classList.remove("refused"); void input.offsetWidth; // restart the shake
        input.classList.add("refused");
        setHint(out.message, "refuse");
        input.select();
        return;
      }
      if (out.suggestion !== undefined) {
        // a near miss: put the real answer in the box; Enter again locks it in
        input.value = out.suggestion;
        input.classList.add("suggested");
        setHint(`Did you mean “${out.suggestion}”? Press Enter to lock it in, or keep typing.`, "suggest");
        input.focus({ preventScroll: true });
        return;
      }
      done = true;
      timer.stop({ clear: true });
      state.play = out.play;
      form.remove();
      showTextReveal(screen, out.result);
      pourIntoJar(jar, out.result);
    } catch (err) {
      toast(err.message);
      if (err.status === 409 || err.status === 404) startPlay(state.play.mode);
    } finally {
      sending = false;
      if (!done) btn.disabled = false;
    }
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
  timer.start(() => { done = false; send({ timedOut: true }); });
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
  const chip = bee === "ruby" ? h("span", { class: "chip ruby-chip" }, "Only runs that finish 800+ ever see me.")
    : result.timedOut ? h("span", { class: "chip" }, "⏱ Time's up — locked in for you.")
      : (result.diff === 1 || result.rank === 2) ? h("span", { class: "chip" }, "One away — so close to Divine.") : null;
  const words = h("div", {},
    h("p", { class: "tier" }, result.tier),
    h("p", { class: "pts" }, `+${result.points}`, h("small", {}, "points")),
    line,
    chip);
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
  const rankBit = result.rank ? ` · #${result.rank}` : result.guess ? " · not on the list" : "";
  const top3 = (result.top3 || []).length
    ? h("ol", { class: "top3", "aria-label": "The top 3 answers" },
      result.top3.map((label, i) => h("li", { class: result.rank === i + 1 ? "you" : "" },
        h("span", { class: "rk" }, `#${i + 1}`), h("span", { class: "lb" }, label), result.rank === i + 1 ? h("span", { class: "tag" }, "you") : null)))
    : null;
  const reveal = h("section", { class: "reveal text-reveal", "aria-live": "polite" },
    ...[heroFor(result, { center: true }),
      h("p", { class: "answer-line", style: "text-align:center" }, "You said: ", h("b", {}, said), rankBit,
        result.readBack && result.readBack.toLowerCase() !== said.toLowerCase() ? h("span", {}, " · read as ", h("b", {}, result.readBack)) : null),
      top3 && h("p", { class: "kicker", style: "text-align:center" }, "The top 3"),
      top3,
      (result.list || []).length > 3 && h("button", { class: "btn ghost small all-btn", type: "button", onclick: () => openFullList(result) }, `See all ${result.list.length} answers`),
      nextButton()].filter(Boolean));
  screen.append(reveal);
  reveal.querySelector(".btn.primary").focus({ preventScroll: true });
}

/** The whole ranked list for a text round, your answer highlighted. */
function openFullList(result) {
  const list = h("ol", { class: "top3 full-list", "aria-label": "Every answer on the list" },
    result.list.map((label, i) => h("li", { class: result.rank === i + 1 ? "you" : "" },
      h("span", { class: "rk" }, `#${i + 1}`), h("span", { class: "lb" }, label), result.rank === i + 1 ? h("span", { class: "tag" }, "you") : null)));
  openOverlay(`All ${result.list.length} answers`, h("div", {}, list,
    h("button", { class: "btn primary", onclick: closeOverlay }, "Close")), { label: "Every answer on the list" });
  list.querySelector("li.you")?.scrollIntoView({ block: "center" });
}

// ---------------------------------------------------------------- results
function renderResults(play) {
  const ruby = isRuby(play.score, play.completed);
  const hero = h("section", { class: "results-hero" },
    ruby && h("div", { class: "enter-diamond" }, h("p", { class: "ruby-label" }, "RUBY"), h("img", { src: BEE_SRC("ruby"), alt: "Ruby bee", width: 120, height: 120 })),
    h("div", { class: "total-row" },
      h("div", { class: "jar-big" }),
      h("div", {}, h("p", { class: "total" }, String(play.score)), h("p", { class: "outof" }, "points of honey"))),
    play.mode === "daily" && countdown());
  const rows = h("section", { class: "card rows", "aria-label": "Your rounds" },
    play.results.map((r, i) => {
      const tier = tierByName(r.tier); const bee = tier?.bee || "yucky"; // by tier name, so older plays map too
      return h("div", { class: "row" },
        h("span", { class: "n" }, i + 1),
        h("div", {}, h("span", { class: "q" }, play.questions[i].text), h("span", { class: "t" }, tier?.name || r.tier)),
        h("img", { class: "row-bee", src: `/img/bee-${bee}-96.png`, alt: `${bee} bee`, width: 36, height: 36 }),
        h("span", { class: "p" }, r.points));
    }));
  const standing = play.completed ? standingsCard(play) : null;
  const actions = h("div", { class: "actions" });
  if (play.mode === "daily") actions.append(h("button", { class: "btn primary", onclick: () => share(play.date) }, "Share my score"));
  else actions.append(h("button", { class: "btn primary", onclick: renderArchive }, "More past games"));
  actions.append(h("button", { class: "btn ghost", onclick: goHome }, "Home"));
  mount(h("main", { class: "screen results" }, masthead({ date: state.date || play.date }), hero, standing, rows, actions, footer()));
  const jar = new HoneyJar(hero.querySelector(".jar-big"), { scale: 4 });
  jar.fill(0, { animate: false });
  requestAnimationFrame(() => jar.fill(play.score / JAR_FULL, { label: `${play.score} points of honey` }));
}

/** "How you stack up": a smooth curve of everyone's scores that day, with your spot marked. */
function standingsCard(play) {
  const card = h("section", { class: "card standings", "aria-label": "How you stack up" },
    h("p", { class: "kicker" }, "How you stack up"), h("p", { class: "loading" }, "Loading"));
  api(`/standings?date=${play.date}`).then(({ standings: s }) => {
    if (!s) { card.remove(); return; }
    const headline = s.beat == null
      ? h("p", { class: "beat" }, "You're the first today!")
      : h("p", { class: "beat" }, "You beat ", h("b", {}, `${s.beat}%`), s.mode === "archive" ? " of that day's players" : " of players today");
    card.replaceChildren(h("p", { class: "kicker" }, "How you stack up"), headline, scoreCurveChart(s),
      h("p", { class: "hint" }, `${s.players} ${s.players === 1 ? "player" : "players"}${s.mode === "archive" ? " that day" : " so far today"}`));
  }).catch(() => card.remove());
  return card;
}

/** The curve itself: an SVG area, lit up to your score, with a bee riding the line where you landed. */
function scoreCurveChart(s) {
  const W = 300, H = 110, TOP = 8;
  const { from, to, points } = s.curve;
  const X = (v) => ((v - from) / (to - from)) * W;
  const Y = (d) => H - d * (H - TOP);
  const pts = points.map(([x, d]) => [X(x), Y(d)]);
  // Catmull-Rom through the points, as cubic Béziers: a smooth line
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += `C${c1.map((n) => n.toFixed(1))} ${c2.map((n) => n.toFixed(1))} ${p2.map((n) => n.toFixed(1))}`;
  }
  const area = `${line}L${W},${H}L0,${H}Z`;
  const you = Math.min(to, Math.max(from, s.score));
  const yx = X(you);
  // the curve's height at your score, read off the sampled points
  const k = Math.min(points.length - 2, Math.max(0, Math.floor(((you - from) / (to - from)) * (points.length - 1))));
  const [xa, da] = points[k], [xb, db] = points[k + 1];
  const yd = da + (db - da) * ((you - xa) / (xb - xa || 1));
  const yy = Y(yd);
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k2, v] of Object.entries(attrs)) n.setAttribute(k2, v); return n; };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "curve-svg", "aria-hidden": "true" });
  const defs = el("defs", {});
  const grad = el("linearGradient", { id: "curve-lit", x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el("stop", { offset: "0", "stop-color": "#ffd60a", "stop-opacity": ".85" }), el("stop", { offset: "1", "stop-color": "#ffd60a", "stop-opacity": ".15" }));
  const clip = el("clipPath", { id: "curve-below" });
  clip.append(el("rect", { x: 0, y: 0, width: yx.toFixed(1), height: H }));
  defs.append(grad, clip);
  svg.append(defs,
    el("path", { d: area, fill: "#2c2719" }),
    el("path", { d: area, fill: "url(#curve-lit)", "clip-path": "url(#curve-below)" }),
    el("path", { d: line, fill: "none", stroke: "#cf9a06", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }),
    el("line", { x1: yx, x2: yx, y1: yy, y2: H, stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }));
  const left = `${(yx / W) * 100}%`, top = `${yy.toFixed(1)}px`; // the SVG is drawn 110px tall, 1:1 vertically
  const bee = h("img", { class: "curve-bee", src: BEE_SRC(isRuby(s.score, true) ? "ruby" : "golden"), alt: "", style: `left:${left};top:${top}` });
  const dot = h("span", { class: "curve-dot", style: `left:${left};top:${top}` });
  // axis: round hundreds inside the range
  const step = to - from > 700 ? 200 : 100;
  const ticks = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);
  const axis = h("div", { class: "curve-axis" }, ticks.map((t) => h("span", { style: `left:${(X(t) / W) * 100}%` }, String(t))));
  const tag = h("span", { class: "curve-you", style: `left:${Math.min(86, Math.max(14, (yx / W) * 100))}%` }, `You · ${s.score}`);
  return h("div", { class: "curve", role: "img", "aria-label": `Everyone's scores today as a curve; you scored ${s.score}` }, svg, dot, bee, tag, axis);
}

/** Seconds until the next Daily: midnight Eastern. */
function secondsToNextDaily() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return 86400 - (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second));
}

/** A live "Next Daily in 7:42:13" line; takes the player home when the new day lands. */
function countdown() {
  const time = h("b", { class: "cd-time" });
  const el = h("p", { class: "countdown" }, "Next Daily in ", time);
  const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const tick = () => {
    if (!el.isConnected && el.dataset.mounted) { clearInterval(iv); return; }
    if (el.isConnected) el.dataset.mounted = "1";
    const s = secondsToNextDaily();
    time.textContent = fmt(Math.max(0, s));
    if (s <= 1 && el.isConnected) { clearInterval(iv); setTimeout(goHome, 1500); }
  };
  const iv = setInterval(tick, 1000);
  tick();
  return el;
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
    h("p", {}, h("b", {}, "Guess the %. "), "Slide or type your guess. Under 1%, tap <1 next to the slider to guess in hundredths."),
    h("p", {}, h("b", {}, "Name the #1. "), "Type an answer on the ranked list — the higher it ranks, the more points. Close spellings get corrected for you; press Enter again to lock it in."),
    h("p", {}, h("b", {}, `${GUESS_SECONDS} seconds to guess, ${TEXT_SECONDS} to type. `), "When time runs out, whatever you have is locked in."),
    h("p", {}, h("b", {}, "Fill the jar. "), "Every point is honey. Pros say there's a bee nobody's seen…"),
    h("p", {}, "The closer your guess, the sweeter the honey: from Yucky up to Divine for a perfect guess."),
    h("button", { class: "btn primary", onclick: closeOverlay }, "Got it")));
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
