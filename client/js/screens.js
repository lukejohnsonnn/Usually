// Honeydle — screens: home, play, reveal, results.
// Depends on: core.js, grid.js, bee.js. Loaded after bee.js.

async function showHome() {
  skeleton();
  screen.classList.add("home"); // centers the short home content (see theme.css)
  const today = await api("/api/today").catch(() => null);
  $("#today-date").textContent = today ? new Date(today.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
  await refreshStats();
  const done = today ? await api(`/api/results?playerId=${playerId()}&date=${today.date}`).catch(() => null) : null;

  screen.innerHTML = `
    <div class="stat-row">
      <div class="stat"><b>${stats ? stats.streak : 0}</b><span>Streak</span></div>
      <div class="stat"><b>${stats ? stats.gamesPlayed : 0}</b><span>Games</span></div>
      <div class="stat"><b>${stats ? stats.bestScore : 0}</b><span>Best</span></div>
      <div class="stat"><b>${stats ? stats.avgScore : 0}</b><span>Avg</span></div>
    </div>
    <div class="bee-crew" aria-label="The Honeydle bee crew">
      <span class="crew-bee" style="--y:2px;--d:0s"><img class="bee" src="assets/bee-normal.png" alt="Bee" width="32" height="32"></span>
      <span class="crew-bee" style="--y:0px;--d:.2s"><img class="bee" src="assets/bee-drop.png" alt="Bee with a honey drop" width="32" height="32"></span>
      <span class="crew-bee" style="--y:-8px;--d:.4s"><img class="bee" src="assets/bee-little-honey.png" alt="Honey-covered bee" width="32" height="32"></span>
      <span class="crew-bee" style="--y:2px;--d:.6s"><img class="bee" src="assets/bee-golden.png" alt="Golden bee" width="32" height="32"></span>
      <span class="crew-bee crew-diamond" style="--y:-5px;--d:.8s"><img class="bee" src="assets/bee-diamond.png" alt="Diamond bee" width="36" height="36"><span class="crew-sparkle" aria-hidden="true">✦</span></span>
      <span class="crew-bee" style="--y:-8px;--d:1s"><img class="bee" src="assets/bee-ruby.png" alt="Ruby bee" width="32" height="32"></span>
      <span class="crew-bee" style="--y:-6px;--d:1.2s"><img class="bee" src="assets/bee-thirsty.png" alt="Thirsty bee" width="32" height="32"></span>
    </div>
    <div class="card">
      <div class="kicker">Today's Daily · 7 rounds</div>
      <p style="font-size:17px">Seven prompts, the same for everyone.<br>One run a day.</p>
      ${done && done.completed
        ? `<p class="muted">Done for today — <b style="color:#ffd60a">${done.score} / 1225</b></p>
           <button class="primary" id="btn-results">See my results</button>`
        : `<button class="primary" id="btn-daily">${done && done.results && done.results.length ? "Resume today's Daily" : "Play today's Daily"}</button>`}
      <div class="row"><button class="ghost" id="btn-endless">Endless practice</button></div>
    </div>`;

  $("#btn-daily")?.addEventListener("click", () => startPlay("daily"));
  $("#btn-results")?.addEventListener("click", () => showResults(done));
  $("#btn-endless")?.addEventListener("click", () => startPlay("endless"));
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
  screen.classList.remove("home"); // round screens stay top-anchored
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
      <div class="type-row"><input type="text" id="text-answer" placeholder="Type your answer…" autocomplete="off" enterkeyhint="go"></div>
      <p class="hint">Tip: name the most common answer.</p>
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
      <div class="legend"><span class="sw gold"></span>Yellow ring = your guess</div>
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
  // Live entry grid: yellow rings up to the current guess (Guess rounds), or
  // white/deep-amber halves (Split rounds). Never any crowd data — the crowd
  // coloring only appears on the reveal.
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

function showReveal(r) {
  const q = currentPlay.questions[currentPlay.currentRound - 1];
  const isText = r.kind === "text";
  const isSplit = r.kind === "split";
  const sub1 = !isText && r.answer < 1;
  const streak = bullseyeStreak();
  const entrance = beeEntranceFor(r.points, streak);
  const nudge = r.tier === "One Off" ? `<div class="nudge">One away — so close to a Bullseye.</div>` : "";

  // In-place reveal: stay on the round screen — no separate reveal card.
  // Hide/disable the answering controls, re-render the on-screen entry
  // grid with the reveal colors (fill animation, cells lighting up in
  // sequence), then show the tier + bee + answer line + legend + Next
  // button in place on the same screen. Text rounds get the same
  // treatment (input hidden, tier + bee + "You said" line appear on the
  // same screen) — and the #1 answer still stays hidden on the reveal.
  const hide = (sel) => { const el = document.querySelector(sel); if (el) el.classList.add("hidden"); };
  const hideSubmitRow = () => { const s = $("#submit"); if (s && s.closest(".row")) s.closest(".row").classList.add("hidden"); };
  if (isText) {
    const input = $("#text-answer");
    if (input) input.disabled = true;
    hide(".type-row");
    document.querySelectorAll(".hint").forEach((el) => el.classList.add("hidden"));
    hideSubmitRow();
  } else if (isSplit) {
    const slider = $("#slider");
    if (slider) slider.disabled = true;
    hide("#slider");
    hide(".split-labels");
    hideSubmitRow();
  } else {
    hide(".legend"); // answering legend ("Yellow ring = your guess")
    hide(".controls"); // slider + typed input + fine-tune + submit
  }

  let legend = "";
  if (!isText) {
    if (isSplit) {
      legend = `<div class="legend reveal-legend"><span class="lg"><span class="sw white"></span>${q.leftLabel}</span><span class="lg"><span class="sw amber"></span>${q.rightLabel}</span><span class="lg"><span class="sw goldfill"></span>Yellow = your split</span></div>`;
    } else {
      legend = `<div class="legend reveal-legend"><span class="lg"><span class="sw white"></span>White = the real number</span><span class="lg"><span class="sw goldfill"></span>Yellow = you got these</span><span class="lg"><span class="sw gold"></span>Yellow ring = your guess only</span></div>`;
    }
  }

  // Re-render the grid that is already on screen with the reveal colors.
  if (!isText) {
    const g = $("#entry-grid");
    if (isSplit) renderGrid(g, { split: { left: r.answer, right: 100 - r.answer }, playerSplit: r.guess });
    else if (sub1) renderGrid(g, { crowd: Math.round(r.answer * 100), guess: Math.round(r.guess * 100) });
    else renderGrid(g, { crowd: r.answer, guess: r.guess });
    // Staggered fill: the cells light up in sequence, left to right.
    g.classList.add("reveal-fill");
    [...g.querySelectorAll(".dot")].forEach((d, i) => { d.style.animationDelay = `${Math.min(i * 8, 800)}ms`; });
  }

  const heroExtras = entrance === "bee-entrance-honey"
    ? `<div class="honey-splash" aria-hidden="true"></div>`
    : entrance === "bee-entrance-diamond"
      ? `<span class="diamond-sparkle s1" aria-hidden="true">✦</span><span class="diamond-sparkle s2" aria-hidden="true">✦</span>`
      : "";
  const reveal = document.createElement("div");
  reveal.id = "reveal";
  // Text rounds have no grid, so the reveal is short — center the block in
  // the free space instead of leaving a black void under the Next button.
  // Guess/Split reveals keep the grid and stay top-anchored with it.
  if (isText) reveal.classList.add("reveal-text");
  reveal.innerHTML = `
      <div class="reveal-hero ${entrance}">
        <div class="tier-line"><div class="tier-name">${r.tier}</div><div class="tier-points">+${r.points} points</div></div>
        <div class="bee-wrap">${heroExtras}<img class="bee bee-reveal" src="assets/${beeForPoints(r.points, streak)}" alt="Honeydle bee" width="112" height="112"></div>
      </div>
      ${nudge}
      ${isText ? `
        <p class="answer-line">You said: <b>${escapeHtml(r.textGuess || "—")}</b>${r.textRank ? ` · #${r.textRank}` : " · not on the list"}</p>`
      : `
        <p class="answer-line">You guessed <b>${isSplit ? `${r.guess} / ${100 - r.guess}` : sub1 ? r.guess.toFixed(2) + "%" : r.guess + "%"}</b> · the real number is <b>${sub1 ? r.answer.toFixed(2) + "%" : r.answer + "%"}</b></p>
        ${r.note ? `<p class="note">${escapeHtml(r.note)}</p>` : ""}
        ${legend}`}
      <div class="row"><button class="primary" id="next">${currentPlay.completed ? "See my score" : "Next round"}</button></div>`;
  // Insert in place: right after the grid on Guess/Split rounds, at the
  // end of the screen on text rounds (no grid there).
  const grid = $("#entry-grid");
  if (grid) grid.after(reveal);
  else screen.appendChild(reveal);
  $("#next").addEventListener("click", () => {
    if (currentPlay.completed) showResults(currentPlay);
    else showRound();
  });
}

async function showResults(play) {
  const rounds = play.questions.map((q, i) => ({ q, r: play.results[i] }));
  screen.classList.remove("home"); // results stay top-anchored
  const ruby = rubyForScore(play.score);
  screen.innerHTML = `
    <div class="card">
      <div class="kicker">${play.mode === "daily" ? "Today's Daily" : "Endless"} · done</div>
      ${ruby ? `
      <div class="ruby-hero bee-entrance-ruby">
        <div class="bee-wrap"><span class="ruby-sparkle s1" aria-hidden="true">✦</span><span class="ruby-sparkle s2" aria-hidden="true">✦</span><img class="bee bee-ruby" src="assets/${ruby}" alt="Ruby bee" width="112" height="112"></div>
        <div class="ruby-label">Ruby</div>
      </div>` : ""}
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
      const text = s.text + "\n\nPlay Honeydle — How well do you know the world?";
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast("Share card copied."); }
    } catch { toast("Couldn't build the share card."); }
  });
  await refreshStats();
}
