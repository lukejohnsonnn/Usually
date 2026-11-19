// The Honeycomb — Honeydle's 100-cell grid.
//
// Ten rows of ten hexagonal wax cells, alternate rows offset by half a cell,
// so the comb is a true honeycomb that is also a plain 10 × 10 count: every
// row is 10%, every cell is 1%. Honey fills from the bottom row up, left to
// right, like a real comb.
//
// Drawn as pixel art at native resolution on a <canvas> and scaled up with
// image-rendering: pixelated, so it stays razor-crisp at any size. A second,
// smooth canvas underneath carries the soft honey glow.

const CELL_W = 12;      // flat-to-flat width of one hex, in art pixels
const CELL_H = 14;      // point-to-point height
const PITCH_X = 14;     // CELL_W + 2px wax wall
const PITCH_Y = 12;     // rows nest into each other's points
const PAD = 5;          // frame padding around the comb
export const COLS = 10;
export const ROWS = 10;
export const ART_W = PAD * 2 + COLS * PITCH_X + PITCH_X / 2 - 2;
export const ART_H = PAD * 2 + (ROWS - 1) * PITCH_Y + CELL_H;

const C = {
  frame: "#1b1708",
  frameEdge: "#3a3112",
  frameHi: "#4d4116",
  emptyWall: "#2e2a1c",
  emptyIn: "#0e0d09",
  emptyHi: "#1d1a10",
  white: "#ffffff",
  whiteShade: "#d9d6cc",
  amber: "#b45309",
  amberShade: "#8a3f06",
  amberHi: "#d0701f",
  yellow: "#ffd60a",
  yellowShade: "#d9a300",
  yellowHi: "#fff3a3",
  ringIn: "#1a1a1a",
  tint: "rgba(255,214,10,0.28)",
};

// --- the hex mask, computed once from a true regular hexagon ---------------
const MASK = (() => {
  const rows = [];
  const cx = CELL_W / 2, cy = CELL_H / 2, R = CELL_H / 2;
  const inside = (x, y) => {
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    return dx <= (Math.sqrt(3) / 2) * R + 0.01 && dy <= R - dx / Math.sqrt(3) + 0.01;
  };
  for (let y = 0; y < CELL_H; y++) {
    const row = [];
    for (let x = 0; x < CELL_W; x++) row.push(inside(x + 0.5, y + 0.5));
    rows.push(row);
  }
  return rows;
})();
const at = (x, y) => y >= 0 && y < CELL_H && x >= 0 && x < CELL_W && MASK[y][x];
const isEdge = (x, y) => at(x, y) && !(at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1));

/** Paint one cell sprite for a given look into an offscreen canvas. */
function paintSprite(look) {
  const cv = document.createElement("canvas");
  cv.width = CELL_W; cv.height = CELL_H;
  const g = cv.getContext("2d");
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      if (!at(x, y)) continue;
      const edge = isEdge(x, y);
      const lowerHalf = y >= CELL_H / 2;
      switch (look) {
        case "empty":
          px(x, y, edge ? C.emptyWall : (lowerHalf && y > CELL_H - 5 ? C.emptyHi : C.emptyIn));
          break;
        case "ring":
          px(x, y, edge ? C.yellow : C.ringIn);
          break;
        case "white":
          px(x, y, edge && lowerHalf ? C.whiteShade : C.white);
          break;
        case "amber":
          px(x, y, edge && lowerHalf ? C.amberShade : C.amber);
          break;
        case "honey":
          px(x, y, edge && lowerHalf ? C.yellowShade : C.yellow);
          break;
        case "tint":
          px(x, y, edge ? "#6b5a12" : "#3a3210");
          break;
        default: break;
      }
    }
  }
  // specular glints: two pixels of shine on the upper-left, like wet honey
  if (look === "honey" || look === "white" || look === "amber") {
    const hi = look === "honey" ? C.yellowHi : look === "amber" ? C.amberHi : "#ffffff";
    if (look !== "white") { px(3, 4, hi); px(4, 3, hi); px(3, 5, hi); }
    else { px(3, 4, "#ffffff"); }
  }
  if (look === "ring") { px(3, 4, "#3a3210"); }
  return cv;
}

function cellOrigin(i) {
  // index 0 is bottom-left; fill runs left→right, bottom row up
  const row = ROWS - 1 - Math.floor(i / COLS);
  const col = i % COLS;
  const shift = row % 2 === 1 ? PITCH_X / 2 : 0; // odd rows nest half a cell right
  return { x: PAD + col * PITCH_X + shift, y: PAD + row * PITCH_Y };
}

/**
 * Turn a value into a per-cell look array.
 * modes:
 *   { mode: "guess", guess }                  answering a % (ring cells)
 *   { mode: "split", left }                   answering a split (white | amber)
 *   { mode: "fine", value }                   fine-tune entry (yellow tint)
 *   { mode: "reveal", guess, real }           guess reveal
 *   { mode: "revealSplit", guess, real }      split reveal
 */
export function looksFor(state) {
  const out = new Array(100).fill("empty");
  const n = (v) => Math.max(0, Math.min(100, Math.round(v)));
  if (state.mode === "guess") {
    for (let i = 0; i < n(state.guess); i++) out[i] = "ring";
  } else if (state.mode === "split") {
    for (let i = 0; i < 100; i++) out[i] = i < n(state.left) ? "white" : "amber";
  } else if (state.mode === "fine") {
    for (let i = 0; i < n(state.value); i++) out[i] = "tint";
  } else if (state.mode === "reveal") {
    const g = n(state.guess), r = n(state.real);
    for (let i = 0; i < 100; i++) {
      if (i < g && i < r) out[i] = "honey";
      else if (i < r) out[i] = "white";
      else if (i < g) out[i] = "ring";
    }
  } else if (state.mode === "revealSplit") {
    const g = n(state.guess), r = n(state.real);
    for (let i = 0; i < 100; i++) out[i] = i < g ? "honey" : i < r ? "white" : "amber";
  }
  return out;
}

export class Honeycomb {
  /** @param {HTMLElement} host  @param {{scale?: number, label?: string}} opts */
  constructor(host, opts = {}) {
    this.host = host;
    this.host.classList.add("comb");
    this.glow = document.createElement("canvas");
    this.glow.className = "comb-glow";
    this.art = document.createElement("canvas");
    this.art.className = "comb-art";
    this.art.width = ART_W;
    this.art.height = ART_H;
    this.art.setAttribute("role", "img");
    this.host.append(this.art, this.glow);
    this.g = this.art.getContext("2d");
    this.sprites = {};
    for (const k of ["empty", "ring", "white", "amber", "honey", "tint"]) this.sprites[k] = paintSprite(k);
    this.looks = new Array(100).fill("empty");
    this.anim = null;
    this.label = opts.label || "Honeycomb";
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
  }

  resize() {
    const w = this.host.clientWidth || ART_W * 2;
    const h = this.host.clientHeight || ART_H * 2;
    let s = Math.min(w / ART_W, h / ART_H);
    // integer scales keep every art pixel the same size; fall back gracefully
    s = s >= 2 ? Math.floor(s * 2) / 2 : s;
    this.scale = s;
    const cssW = Math.round(ART_W * s), cssH = Math.round(ART_H * s);
    for (const c of [this.art, this.glow]) { c.style.width = `${cssW}px`; c.style.height = `${cssH}px`; }
    const dpr = window.devicePixelRatio || 1;
    this.glow.width = Math.round(cssW * dpr);
    this.glow.height = Math.round(cssH * dpr);
    this.draw();
  }

  /** Instantly show a state (answering). */
  set(state, ariaText) {
    if (this.anim) { cancelAnimationFrame(this.anim.raf); this.anim = null; }
    this.looks = looksFor(state);
    if (ariaText) this.art.setAttribute("aria-label", ariaText);
    this.draw();
  }

  /** Re-render in place as a reveal: cells light up in fill order, each popping as it lands. */
  reveal(state, ariaText) {
    if (ariaText) this.art.setAttribute("aria-label", ariaText);
    const target = looksFor(state);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { this.looks = target; this.draw(); return Promise.resolve(); }
    const lit = target.map((l, i) => (l !== "empty" ? i : -1)).filter((i) => i >= 0);
    const step = Math.min(8, 800 / Math.max(1, lit.length));
    const startAt = new Map(lit.map((idx, k) => [idx, k * step]));
    const POP = 160;
    this.looks = new Array(100).fill("empty");
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (t) => {
        const el = t - t0;
        const pops = [];
        for (const [idx, st] of startAt) {
          if (el >= st) {
            this.looks[idx] = target[idx];
            const p = (el - st) / POP;
            if (p < 1) pops.push({ idx, k: 1 + 0.18 * Math.sin(Math.PI * p) });
          }
        }
        this.draw(pops);
        if (el < (lit.length ? (lit.length - 1) * step : 0) + POP) {
          this.anim = { raf: requestAnimationFrame(frame) };
        } else {
          this.anim = null;
          this.looks = target;
          this.draw();
          resolve();
        }
      };
      this.anim = { raf: requestAnimationFrame(frame) };
    });
  }

  draw(pops = []) {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, ART_W, ART_H);
    // the frame — a dark wax panel with a stepped pixel edge
    g.fillStyle = C.frameEdge;
    g.fillRect(2, 0, ART_W - 4, ART_H); g.fillRect(0, 2, ART_W, ART_H - 4); g.fillRect(1, 1, ART_W - 2, ART_H - 2);
    g.fillStyle = C.frame;
    g.fillRect(2, 1, ART_W - 4, ART_H - 2); g.fillRect(1, 2, ART_W - 2, ART_H - 4);
    g.fillStyle = C.frameHi;
    g.fillRect(3, 1, ART_W - 6, 1);
    const popped = new Map(pops.map((p) => [p.idx, p.k]));
    for (let i = 0; i < 100; i++) {
      if (popped.has(i)) continue;
      const { x, y } = cellOrigin(i);
      g.drawImage(this.sprites[this.looks[i]], x, y);
    }
    for (const [i, k] of popped) {
      const { x, y } = cellOrigin(i);
      const w = Math.round(CELL_W * k), h = Math.round(CELL_H * k);
      g.drawImage(this.sprites[this.looks[i]], x - Math.round((w - CELL_W) / 2), y - Math.round((h - CELL_H) / 2), w, h);
    }
    this.drawGlow();
  }

  drawGlow() {
    const g = this.glow.getContext("2d");
    const sx = this.glow.width / ART_W, sy = this.glow.height / ART_H;
    g.clearRect(0, 0, this.glow.width, this.glow.height);
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 100; i++) {
      if (this.looks[i] !== "honey") continue;
      const { x, y } = cellOrigin(i);
      const cx = (x + CELL_W / 2) * sx, cy = (y + CELL_H / 2) * sy;
      const r = CELL_W * sx * 1.25;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, "rgba(255,190,0,0.20)");
      grad.addColorStop(1, "rgba(255,190,0,0)");
      g.fillStyle = grad;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }

  destroy() {
    this.ro.disconnect();
    if (this.anim) cancelAnimationFrame(this.anim.raf);
  }
}
