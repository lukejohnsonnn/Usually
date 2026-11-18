// Honeydle — client. Vanilla JS, no build step.
// Core helpers + shared state. Loaded first; later modules share
// these globals via plain <script> tags in dependency order.

// Honeydle — client. Vanilla JS, no build step.
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
  el.style.background = `linear-gradient(to right, var(--gold-bright) 0%, var(--gold-bright) ${pct}%, var(--line) ${pct}%, var(--line) 100%)`;
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


function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
