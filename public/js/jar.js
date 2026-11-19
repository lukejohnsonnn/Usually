// The honey jar — your score as honey. Pixel art drawn at native size on a
// <canvas> and scaled with image-rendering: pixelated. It fills from the
// bottom as points come in; each fill drops a drip from the lid.

const W = 18, H = 23;
const C = {
  lid: "#c98a1a", lidHi: "#f0b84a", lidDark: "#7a4e08",
  glass: "#9fb4bd", glassDark: "#5d6e75", glassHi: "#e8f6ff", inside: "#121212",
  honey: "#ffbf00", honeyDark: "#d98a00", honeyTop: "#ffe066", honeyHi: "#fff4b0",
  label: "#f3e6c4", labelDark: "#b9a77a",
};

// body rows (y) → [x0, x1] inclusive, the glass outline included
const BODY = {};
for (let y = 6; y <= 22; y++) {
  BODY[y] = y === 6 || y === 22 ? [3, 14] : y === 7 || y === 21 ? [2, 15] : [1, 16];
}
const BODY_TOP = 7, BODY_BOTTOM = 21; // honey can sit on rows 8..21 (inside the glass)
const CAPACITY = BODY_BOTTOM - BODY_TOP; // 14 rows of honey

export class HoneyJar {
  /** @param {HTMLElement} host  @param {{scale?: number}} opts */
  constructor(host, { scale = 2 } = {}) {
    this.cv = document.createElement("canvas");
    this.cv.width = W; this.cv.height = H;
    this.cv.className = "jar";
    this.cv.style.width = `${W * scale}px`;
    this.cv.style.height = `${H * scale}px`;
    this.cv.setAttribute("role", "img");
    host.append(this.cv);
    this.g = this.cv.getContext("2d");
    this.level = 0;   // rows of honey, may be fractional while animating
    this.drip = null; // y of a falling drop
    this.raf = 0;
    this.draw();
  }

  /** Set the fill as a fraction 0..1 of the jar. */
  fill(fraction, { animate = true, label } = {}) {
    if (label) this.cv.setAttribute("aria-label", label);
    const target = Math.max(0, Math.min(1, fraction)) * CAPACITY;
    cancelAnimationFrame(this.raf);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce || Math.abs(target - this.level) < 0.01) {
      this.level = target; this.drip = null; this.draw(); return;
    }
    const from = this.level;
    const t0 = performance.now();
    const DROP = 260, FILL = 650;
    const step = (t) => {
      const el = t - t0;
      if (el < DROP) {
        this.drip = 5 + (el / DROP) * (BODY_BOTTOM - this.level - 5); // falls from the lid to the surface
      } else {
        this.drip = null;
        const p = Math.min(1, (el - DROP) / FILL);
        const ease = 1 - Math.pow(1 - p, 3);
        this.level = from + (target - from) * ease;
      }
      this.draw();
      if (el < DROP + FILL) this.raf = requestAnimationFrame(step);
      else { this.level = target; this.draw(); }
    };
    this.raf = requestAnimationFrame(step);
  }

  draw() {
    const g = this.g;
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const row = (y, x0, x1, c) => { g.fillStyle = c; g.fillRect(x0, y, x1 - x0 + 1, 1); };
    g.clearRect(0, 0, W, H);

    // lid: a domed golden cap with a rim
    row(0, 5, 12, C.lidDark);
    row(1, 4, 13, C.lid); row(1, 5, 8, C.lidHi);
    row(2, 3, 14, C.lid); row(2, 4, 6, C.lidHi);
    row(3, 3, 14, C.lidDark);
    // neck
    row(4, 4, 13, C.glassDark); row(5, 4, 13, C.glass);
    for (let x = 5; x <= 12; x++) { px(x, 4, C.inside); px(x, 5, C.inside); }

    // glass body
    for (let y = 6; y <= 22; y++) {
      const [x0, x1] = BODY[y];
      row(y, x0, x1, y >= 20 ? C.glassDark : C.glass);
      if (y > 6 && y < 22) row(y, x0 + 1, x1 - 1, C.inside);
    }

    // honey, from the bottom up
    const rows = Math.round(this.level);
    for (let i = 0; i < rows; i++) {
      const y = BODY_BOTTOM - i;
      const [x0, x1] = BODY[y];
      const top = i === rows - 1;
      row(y, x0 + 1, x1 - 1, top ? C.honeyTop : y >= 19 ? C.honeyDark : C.honey);
    }
    if (rows >= 3) { // a wet glint in the honey
      const gy = BODY_BOTTOM - Math.min(rows - 2, 6);
      px(4, gy, C.honeyHi); px(4, gy + 1, C.honeyHi);
    }

    // label band with a tiny hex
    for (let y = 12; y <= 15; y++) row(y, 5, 12, y === 15 ? C.labelDark : C.label);
    px(8, 13, C.honeyDark); px(9, 13, C.honeyDark); px(7, 14, C.honeyDark); px(10, 14, C.honeyDark);
    px(8, 14, C.honey); px(9, 14, C.honey);

    // glass shine
    for (let y = 8; y <= 18; y++) if (y < 12 || y > 15) px(2, y, C.glassHi);
    px(3, 8, C.glassHi);

    // the falling drip
    if (this.drip != null) {
      const y = Math.round(this.drip);
      px(9, y, C.honey); px(9, y + 1, C.honeyTop); px(8, y + 1, C.honey);
    }
  }

  destroy() { cancelAnimationFrame(this.raf); }
}
