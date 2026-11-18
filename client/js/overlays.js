// Honeydle — fine-tune overlay, footer overlays, boot.
// Depends on: core.js, grid.js, screens.js. Loaded last.

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
  // Fine-tune grid: bright yellow 28% mix over dark + inset yellow ring.
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

