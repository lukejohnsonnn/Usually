// Crowdle — client. Vanilla JS, no build step.
const $ = (s) => document.querySelector(s);
const screen = $("#screen");

function playerId() {
  let id = localStorage.getItem("usually-player");
  if (!id) {
    id = "u-" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    localStorage.setItem("usually-player", id);
  }
  return id;
}

async function api(path, opts) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...(opts || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Network error");
  return j;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2600);
}

function skeleton() {
  screen.innerHTML = `<div class="card"><p class="muted">Loading…</p></div>`;
}

function sliderFill(el) {
  const min = +el.min, max = +el.max, v = +el.value;
  const pct = ((v - min) / (max - min)) * 100;
  el.style.background = `linear-gradient(to right, var(--navy) 0%, var(--navy) ${pct}%, var(--line) ${pct}%, var(--line) 100%)`;
}

// ------------------------------------------------------------ grid rendering
function renderGrid(container, spec) {
  // One shared 100-dot grid (188px) for answering and reveal, same component.
  // Reveal Guess {crowd, guess}: dots are REGIONS — every dot up to the crowd
  // is solid navy, every dot up to the guess carries the inset gold ring, and
  // overlap (in both) is a solid GOLD fill, so "you got these" reads instantly
  // against crowd-only navy: overlap = gold fill, crowd-only = navy,
  // guess-only = surface + ring. Gold fill = you, everywhere on the reveal.
  // Reveal Split {split:{left,right}, playerSplit}: halves by the crowd's
  // split; the dots up to the player's split are gold-filled, so the gold
  // region is the player's split and the navy/poppy after it is the crowd's.
  // Entry specs (while answering, never any crowd data):
  //   {entry:"guess", value} — surface fill + inset gold ring on exactly
  //     round(value) dots in row-major order
  //   {entry:"split", left} — navy/poppy halves, NO gold ring at all
  //   {entry:"fine", value} — fine-tune hundredths: gold 28% mix + ring
  container.innerHTML = "";
  for (let i = 0; i < 100; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    if (spec.entry === "split") {
      if (i < spec.left) d.classList.add("navy");
      else d.classList.add("poppy");
    } else if (spec.entry === "fine") {
      if (i < Math.round(spec.value)) d.classList.add("ft");
    } else if (spec.entry === "guess") {
      if (i < Math.round(spec.value)) d.classList.add("gold");
    } else if (spec.split) {
      if (i < spec.split.left) d.classList.add("navy");
      else d.classList.add("poppy");
      if (spec.playerSplit != null && i < spec.playerSplit) d.classList.add("gold");
    } else {
      if (i < spec.crowd) d.classList.add("navy");
      if (spec.guess != null && i < Math.round(spec.guess)) d.classList.add("gold");
    }
    container.appendChild(d);
  }
}

// ------------------------------------------------------------------- state
let currentPlay = null;
let stats = null;

async function refreshStats() {
  try {
    stats = await api(`/api/stats?playerId=${playerId()}`);
    if (stats.streak > 0) {
      $("#streak-chip").classList.remove("hidden");
      $("#streak-n").textContent = stats.streak;
    }
  } catch { /* stats are a nicety; play still works */ }
}

// -------------------------------------------------------------------- home
async function showHome() {
  skeleton();
  const today = await api("/api/today").catch(() => null);
  $("#today-date").textContent = today ? new Date(today.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
  await refreshStats();
  const done = today ? await api(`/api/results?playerId=${playerId()}&date=${today.date}`).catch(() => null) : null;
  const contrib = await api(`/api/contribute?playerId=${playerId()}`).catch(() => null);

  screen.innerHTML = `
    <div class="stat-row">
      <div class="stat"><b>${stats ? stats.streak : 0}</b><span>Streak</span></div>
      <div class="stat"><b>${stats ? stats.gamesPlayed : 0}</b><span>Games</span></div>
      <div class="stat"><b>${stats ? stats.bestScore : 0}</b><span>Best</span></div>
      <div class="stat"><b>${stats ? stats.avgScore : 0}</b><span>Avg</span></div>
    </div>
    <div class="card">
      <div class="kicker">Today's Daily · 7 rounds</div>
      <p style="font-size:17px">Seven prompts, the same for everyone.<br>One run a day.</p>
      ${done && done.completed
        ? `<p class="muted">Done for today — <b style="color:#232c42">${done.score} / 1225</b></p>
           <button class="primary" id="btn-results">See my results</button>`
        : `<button class="primary" id="btn-daily">${done && done.results && done.results.length ? "Resume today's Daily" : "Play today's Daily"}</button>`}
      <div class="row"><button class="ghost" id="btn-endless">Endless practice</button></div>
    </div>
    <div class="card">
      <div class="kicker">Contribute</div>
      <p>Answer the real preference behind a question. Your vote is recorded.</p>
      ${contrib && contrib.unlocked
        ? `<button class="primary" id="btn-contrib">Contribute (${contrib.questions.length} to vote on)</button>`
        : `<button class="primary" disabled>Locked — finish today's Daily first</button>`}
    </div>`;

  $("#btn-daily")?.addEventListener("click", () => startPlay("daily"));
  $("#btn-results")?.addEventListener("click", () => showResults(done));
  $("#btn-endless")?.addEventListener("click", () => startPlay("endless"));
  $("#btn-contrib")?.addEventListener("click", showContribute);
}

// -------------------------------------------------------------------- play
async function startPlay(mode) {
  skeleton();
  try {
    currentPlay = await api("/api/play", { method: "POST", body: JSON.stringify({ playerId: playerId(), mode }) });
    showRound();
  } catch (e) { toast(e.message); showHome(); }
}

function showRound() {
  const play = currentPlay;
  const idx = play.currentRound;
  if (idx >= play.questions.length) return showResults(play);
  const q = play.questions[idx];
  const isText = q.kind === "text";
  const isSplit = q.kind === "split";

  screen.innerHTML = `
    <div class="progress">Round ${idx + 1} of 7 · ${play.mode === "daily" ? "Daily" : "Endless"}</div>
    <div class="kicker">${q.category}</div>
    <div class="qtext">${q.text}</div>
    ${isText ? `
      <p class="hint">Reminder: guess what the crowd would most likely say.</p>
      <div class="type-row"><input type="text" id="text-answer" placeholder="Type your answer…" autocomplete="off" enterkeyhint="go"></div>
      <p class="hint">One answer — the crowd's #1 scores the most.</p>
      <div class="row"><button class="primary" id="submit">Submit</button></div>
    ` : isSplit ? `
      <div class="big-guess"><span id="guess-num">50</span></div>
      <div id="entry-grid" class="grid entry"></div>
      <input type="range" id="slider" min="0" max="100" step="1" value="50">
      <div class="split-labels"><span class="l" id="lbl-left">${q.leftLabel}</span><span class="r" id="lbl-right">${q.rightLabel}</span></div>
      <div class="row"><button class="primary" id="submit">Lock it in</button></div>
    ` : `
      <div class="big-guess"><span id="guess-num">50</span><span class="pct">%</span></div>
      <div id="entry-grid" class="grid entry"></div>
      <div class="legend"><span class="sw gold"></span>Gold ring = your guess</div>
      <div class="controls">
      <div style="text-align:center"><button class="finetune-btn hidden" id="finetune-btn">Fine-tune hundredths ↓</button></div>
      <input type="range" id="slider" min="0" max="100" step="1" value="50">
      <div class="slider-labels"><span>0%</span><span>100%</span></div>
      <div class="type-row"><input type="number" id="typed" min="0" max="100" step="1" value="50" inputmode="decimal"></div>
      <p class="hint">Decimals only below 1% — slide to 1 or under, then fine-tune.</p>
      <div class="row"><button class="primary" id="submit">Lock it in</button></div>
      </div>
    `}`;

  if (isText) {
    const input = $("#text-answer");
    input.focus();
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitText(); });
    $("#submit").addEventListener("click", submitText);
    async function submitText() {
      const answer = input.value.trim();
      if (!answer) { toast("Type an answer first."); return; }
      await submitRound({ answer });
    }
    return;
  }

  const slider = $("#slider");
  const num = $("#guess-num");
  let guess = 50;
  let fineTuned = null; // hundredths value when fine-tune is used

  function sync(v) {
    guess = v;
    fineTuned = null;
    num.textContent = isSplit ? `${v}` : `${v}`;
    if (isSplit) {
      const right = 100 - v;
      num.innerHTML = `${v}<span class="pct"> / ${right}</span>`;
    }
    sliderFill(slider);
    renderEntryGrid();
    const typed = $("#typed");
    if (typed) typed.value = v;
    const ft = $("#finetune-btn");
    if (ft) ft.classList.toggle("hidden", !(v <= 1));
  }
  // Live entry grid: gold rings up to the current guess (Guess rounds), or
  // navy/poppy halves with the split gold-ringed (Split rounds). Never any
  // crowd data — the crowd coloring only appears on the reveal.
  function renderEntryGrid() {
    const g = $("#entry-grid");
    if (!g) return;
    if (isSplit) renderGrid(g, { entry: "split", left: guess });
    else if (fineTuned != null) renderGrid(g, { entry: "guess", value: Math.round(fineTuned * 100) });
    else renderGrid(g, { entry: "guess", value: Math.round(guess) });
  }
  slider.addEventListener("input", () => sync(+slider.value));
  sync(50);
  const typed = $("#typed");
  if (typed) {
    typed.addEventListener("change", () => {
      let v = parseFloat(typed.value);
      if (Number.isNaN(v)) v = 50;
      v = Math.max(0, Math.min(100, v));
      if (v >= 1) v = Math.round(v);
      slider.value = Math.round(v);
      sync(v);
    });
  }
  const ftBtn = $("#finetune-btn");
  if (ftBtn) ftBtn.addEventListener("click", () => openFineTune(guess, (val) => {
    fineTuned = val;
    guess = val;
    num.textContent = val.toFixed(2);
    slider.value = 1;
    sliderFill(slider);
    renderEntryGrid();
    if (typed) typed.disabled = false;
  }));
  $("#submit").addEventListener("click", async () => {
    await submitRound({ guess: fineTuned != null ? fineTuned : guess });
  });
}

async function submitRound(body) {
  const play = currentPlay;
  try {
    const res = await api(`/api/play/${play.playId}/submit`, {
      method: "POST",
      body: JSON.stringify({ playerId: playerId(), roundIndex: play.currentRound, ...body }),
    });
    currentPlay.score = res.score;
    currentPlay.currentRound = res.currentRound;
    currentPlay.completed = res.completed;
    currentPlay.results.push(res.result);
    showReveal(res.result);
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ reveal
function showReveal(r) {
  const q = currentPlay.questions[currentPlay.currentRound - 1];
  const isText = r.kind === "text";
  const isSplit = r.kind === "split";
  const sub1 = !isText && r.answer < 1;
  let gridHtml = "";
  let legend = "";
  if (!isText) {
    if (isSplit) {
      gridHtml = `<div id="grid" class="grid"></div>`;
      legend = `<div class="legend"><span class="sw navy"></span>${q.leftLabel}<span class="sw poppy"></span>${q.rightLabel}<span class="sw goldfill"></span>Gold = your split</div>`;
    } else {
      gridHtml = `<div id="grid" class="grid"></div>`;
      legend = `<div class="legend"><span class="sw navy"></span>Navy = the crowd<br><span class="sw goldfill"></span>Gold = you got these<br><span class="sw gold"></span>Gold ring = your guess only</div>`;
    }
  }
  const burst = r.tier === "Bullseye" ? "burst" : "";
  const nudge = r.tier === "Dead On" ? `<div class="nudge">One away — so close to a Bullseye.</div>` : "";

  screen.innerHTML = `
    <div class="card ${burst}">
      <div class="tier-line"><div class="tier-name">${r.tier}</div><div class="tier-points">+${r.points} points</div></div>
      ${nudge}
      ${isText ? `
        <p class="answer-line">You said: <b>${escapeHtml(r.textGuess || "—")}</b>${r.textRank ? ` · #${r.textRank}` : " · not in the crowd's list"}</p>`
      : `
        <p class="answer-line">You guessed <b>${isSplit ? `${r.guess} / ${100 - r.guess}` : sub1 ? r.guess.toFixed(2) + "%" : r.guess + "%"}</b> · the crowd says <b>${sub1 ? r.answer.toFixed(2) + "%" : r.answer + "%"}</b></p>
        ${r.note ? `<p class="note">${escapeHtml(r.note)}</p>` : ""}
        ${gridHtml}${legend}`}
      <div class="row"><button class="primary" id="next">${currentPlay.completed ? "See my score" : "Next round"}</button></div>
    </div>`;
  if (!isText) {
    const g = $("#grid");
    if (isSplit) renderGrid(g, { split: { left: r.answer, right: 100 - r.answer }, playerSplit: r.guess });
    else if (sub1) renderGrid(g, { crowd: Math.round(r.answer * 100), guess: Math.round(r.guess * 100) });
    else renderGrid(g, { crowd: r.answer, guess: r.guess });
  }
  $("#next").addEventListener("click", () => {
    if (currentPlay.completed) showResults(currentPlay);
    else showRound();
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----------------------------------------------------------------- results
async function showResults(play) {
  const rounds = play.questions.map((q, i) => ({ q, r: play.results[i] }));
  screen.innerHTML = `
    <div class="card">
      <div class="kicker">${play.mode === "daily" ? "Today's Daily" : "Endless"} · done</div>
      <div class="score-big">${play.score}</div>
      <div class="score-max">out of 1225</div>
      ${rounds.map(({ q, r }) => `
        <div class="result-row">
          <span class="t">${escapeHtml(q.text)}</span>
          <b>${r ? r.tier + " · +" + r.points : "—"}</b>
        </div>`).join("")}
      <div class="row"><button class="primary" id="share">Share my score</button></div>
      <div class="row"><button class="ghost" id="back-home">Home</button></div>
    </div>`;
  $("#back-home").addEventListener("click", showHome);
  $("#share").addEventListener("click", async () => {
    try {
      const s = await api(`/api/share?playerId=${playerId()}&date=${play.playDate}`);
      const text = s.text + "\n\nPlay Crowdle — How well do you know people?";
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Share card copied."); }
    } catch { toast("Couldn't build the share card."); }
  });
  await refreshStats();
}

// -------------------------------------------------------------- contribute
async function showContribute() {
  skeleton();
  const data = await api(`/api/contribute?playerId=${playerId()}`).catch(() => null);
  if (!data || !data.unlocked) { toast("Contribute unlocks after today's Daily."); return showHome(); }
  renderContribute(data.questions);
}

function renderContribute(questions) {
  if (!questions.length) {
    screen.innerHTML = `<div class="card"><h2>Contribute</h2><p>You're all caught up — no questions to vote on right now. New ones appear as the crowd grows.</p><div class="row"><button class="primary" id="back-home">Home</button></div></div>`;
    $("#back-home").addEventListener("click", showHome);
    return;
  }
  const q = questions[0];
  screen.innerHTML = `
    <div class="progress">Contribute · ${questions.length} left</div>
    <div class="card vote-card" id="vote-card">
      <div class="kicker">${q.category}</div>
      <div class="vote-prompt">${escapeHtml(q.votePrompt)}</div>
      ${q.kind === "split" ? `
        <div class="vote-btns">
          <button class="vote-side-l" data-vote="left">${escapeHtml(q.leftLabel)}</button>
          <button class="vote-side-r" data-vote="right">${escapeHtml(q.rightLabel)}</button>
        </div>`
      : `
        <div class="vote-btns">
          <button class="vote-yes" data-vote="yes">Yes</button>
          <button class="vote-no" data-vote="no">No</button>
        </div>`}
      <p class="hint">Your vote is recorded. Percentages are never shown.</p>
    </div>
    <div class="row"><button class="ghost" id="back-home">Done for now</button></div>`;
  $("#back-home").addEventListener("click", showHome);
  document.querySelectorAll("[data-vote]").forEach((b) => b.addEventListener("click", async () => {
    const card = $("#vote-card");
    card.classList.add("leaving");
    try {
      await api("/api/contribute/vote", { method: "POST", body: JSON.stringify({ playerId: playerId(), questionId: q.id, vote: b.dataset.vote }) });
    } catch { /* vote errors stay silent; the card still moves on */ }
    setTimeout(() => renderContribute(questions.slice(1)), 320);
  }));
}

// --------------------------------------------------------------- fine-tune
let ftValue = 0.5;
let ftOnOk = null;
function openFineTune(current, onOk) {
  ftValue = current < 1 ? current : 0.5;
  ftOnOk = onOk;
  $("#finetune").classList.remove("hidden");
  const slider = $("#ft-slider");
  slider.value = Math.round(ftValue * 100);
  sliderFill(slider);
  syncFt();
  slider.oninput = () => { ftValue = +slider.value / 100; sliderFill(slider); syncFt(); };
}
function syncFt() {
  $("#ft-value").textContent = ftValue.toFixed(2);
  // Fine-tune grid: gold 28% mix over surface + inset gold ring.
  renderGrid($("#ft-grid"), { entry: "fine", value: Math.round(ftValue * 100) });
}
$("#ft-ok").addEventListener("click", () => {
  $("#finetune").classList.add("hidden");
  if (ftOnOk) ftOnOk(ftValue);
});
$("#ft-cancel").addEventListener("click", () => $("#finetune").classList.add("hidden"));

// ---------------------------------------------------------------- overlays
$("#howto-btn").addEventListener("click", () => $("#howto").classList.remove("hidden"));
$("#howto-close").addEventListener("click", () => {
  $("#howto").classList.add("hidden");
  localStorage.setItem("usually-seen-howto", "1");
});
$("#yesterday-btn").addEventListener("click", async () => {
  $("#yesterday").classList.remove("hidden");
  const body = $("#yesterday-body");
  body.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const y = await api("/api/yesterday");
    body.innerHTML = y.rounds.map((r) => `
      <div class="result-row"><span class="t">${escapeHtml(r.text)}</span><b>${r.kind === "text" ? escapeHtml(r.answer) : (r.answer < 1 ? r.answer.toFixed(2) + "%" : r.answer + "%")}</b></div>`).join("");
  } catch { body.innerHTML = `<p class="muted">Couldn't load yesterday's answers.</p>`; }
});
$("#yesterday-close").addEventListener("click", () => $("#yesterday").classList.add("hidden"));

// -------------------------------------------------------------------- boot
(async function boot() {
  if (!localStorage.getItem("usually-seen-howto")) {
    setTimeout(() => $("#howto").classList.remove("hidden"), 400);
  }
  await showHome();
})();
