// Honeydle — organic grid candidates (2026-11-18).
// Luke asked if the grid can be ONE seamless organic shape instead of
// looking coded in HTML. Answer: yes — place the 100 dots by code on a
// jittered hex lattice inside an organic radial outline (no rows at all),
// and fuse the lit region with an SVG goo filter so the fill reads as one
// continuous honey mass. The underlying model stays 100 discrete cells
// (each = 1%); only the presentation changes.
//
// Placement: hex lattice, pitch P=13px, vertical pitch V=P*sqrt(3)/2.
// Each row gets a random x-phase shift (±3px) and each dot a ±1.2px jitter
// (seeded mulberry32 — reproducible). Min center distance stays ≥ ~10.6px:
// within-row spacing is 13±2.4; cross-row nearest is V=11.26 minus at most
// the phase+jitter difference in the horizontal offset, which can only
// bring two dots to near-vertical alignment (distance ≈ V ≥ 10).
// Outline: radial function r(θ) = 1 + Σ a_k·sin(kθ+φ_k) on an ellipse
// (Rx, Ry), scaled by binary search until exactly 100 lattice points fall
// inside (dots kept 5px inside the boundary so no dot crosses the edge).
// Fill order = sort by y, then x (top-to-bottom sweep, like the live grid).
//
// Run: node scripts/organic-shapes.mjs
// Emits /tmp/honeycomb-organic/points.js (const ORGANIC = {name: {points,
// metrics}}) consumed by /tmp/honeycomb-organic/compare.html.
import { writeFileSync } from "node:fs";

const D = 10; // dot diameter
const P = 13; // hex lattice pitch
const V = P * Math.sqrt(3) / 2; // 11.258 vertical pitch
const JX = 1.2; // per-dot horizontal jitter (±)
const JY = 0.5; // per-dot vertical jitter (±) — kept small on purpose: two
// dots in adjacent rows can sit nearly on top of each other horizontally,
// so their distance is ~V − 2·JY; with V=11.26, JY=0.5 keeps it ≥ 10.26px.
const PHASE = 3;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Outline profiles: ellipse radii + sinusoidal wobble terms [k, amp, phase].
// All three are wide/low on purpose: the grid must fit the 188×120px
// one-screen budget, so the organic shape is a wide puddle/splat, not tall.
const CANDIDATES = {
  // Wobbly wide blob — a puddle of honey.
  BLOB: {
    rx: 92, ry: 56, seed: 11,
    mods: [[3, 0.07, 0.7], [5, 0.05, 2.1], [2, 0.04, 0.3]],
    note: "wobbly wide blob (honey puddle)",
  },
  // Honey splash — wide mass with a drip lobe hanging off the bottom center.
  // The drip fills last (bottom of the sweep), like honey dripping down.
  SPLASH: {
    rx: 90, ry: 54, seed: 23,
    mods: [[3, 0.06, 1.9], [6, 0.04, 0.5]],
    drip: { theta: Math.PI / 2, amp: 0.30, sigma: 0.35 },
    note: "splash with a bottom drip lobe",
  },
  // Living hive mass — lumpier outline, softer edges, denser-feeling middle.
  // (Wobble kept modest: deep inward dents shrink the usable area and push
  // the outline past the 188×120 budget at the scale needed for 100 dots.)
  HIVE: {
    rx: 84, ry: 53, seed: 37,
    mods: [[4, 0.04, 1.3], [7, 0.04, 0.5], [3, 0.03, 2.8]],
    note: "lumpy organic hive cluster",
  },
};

function outlineRadius(profile, theta) {
  let r = 1;
  for (const [k, a, ph] of profile.mods) r += a * Math.sin(k * theta + ph);
  if (profile.drip) {
    const d = profile.drip;
    const diff = Math.atan2(Math.sin(theta - d.theta), Math.cos(theta - d.theta));
    r += d.amp * Math.exp(-(diff * diff) / (2 * d.sigma * d.sigma));
  }
  return r;
}

// Lattice points for a given scale; returns sorted (fill order) points.
function generate(profile, scale) {
  const rx = profile.rx * scale, ry = profile.ry * scale;
  const rng = mulberry32(profile.seed);
  const pts = [];
  // Lattice spans the outline bounding box with margin.
  const rowCount = Math.ceil((2 * ry + 20) / V) + 2;
  for (let row = 0; row < rowCount; row++) {
    const y = -ry - 10 + row * V;
    const phase = (rng() * 2 - 1) * PHASE + (row % 2 ? P / 2 : 0);
    const colCount = Math.ceil((2 * rx + 20) / P) + 2;
    for (let col = 0; col < colCount; col++) {
      const x = -rx - 10 + col * P + phase + (rng() * 2 - 1) * JX;
      const yy = y + (rng() * 2 - 1) * JY;
      const u = x / rx, v = yy / ry;
      const norm = Math.hypot(u, v);
      if (norm >= 1.5) continue;
      const theta = Math.atan2(v, u);
      // Dot center must sit a full radius inside the outline.
      const margin = 5 / Math.min(rx, ry);
      if (norm <= outlineRadius(profile, theta) - margin) pts.push([x, yy]);
    }
  }
  // Fill order: top-to-bottom sweep, left-to-right within a band.
  pts.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return pts;
}

function countAt(profile, scale) {
  return generate(profile, scale).length;
}

// Binary-search a scale giving exactly 100 points.
function findScale(profile) {
  let lo = 0.6, hi = 1.4;
  if (countAt(profile, lo) > 100 || countAt(profile, hi) < 100) {
    throw new Error(`${profile.note}: count out of range at search bounds`);
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const c = countAt(profile, mid);
    if (c === 100) return mid;
    if (c < 100) lo = mid; else hi = mid;
  }
  // Counts jump in steps; if no scale hits exactly 100, take the closest
  // and trim/add boundary points deterministically.
  const mid = (lo + hi) / 2;
  let pts = generate(profile, mid);
  if (pts.length > 100) {
    // Drop the points farthest from the center (outermost first).
    const cx = 0, cy = 0;
    pts.sort((a, b) => Math.hypot(b[0] - cx, b[1] - cy) - Math.hypot(a[0] - cx, a[1] - cy));
    pts = pts.slice(pts.length - 100);
  } else {
    throw new Error(`${profile.note}: binary search ended at ${pts.length}, cannot reach 100`);
  }
  pts.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return { scale: mid, pts };
}

function metrics(points) {
  let minDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (d < minDist) minDist = d;
    }
  }
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX + D, h = maxY - minY + D;
  // Symmetry: mean x of points vs. outline center (0). |mean| should be ~0.
  const meanX = xs.reduce((a, b) => a + b, 0) / points.length;
  // Fill-order check: y must be non-decreasing with index.
  let monotonic = true;
  for (let i = 1; i < points.length; i++) if (points[i][1] < points[i - 1][1] - 1e-9) monotonic = false;
  return { count: points.length, width: +w.toFixed(1), height: +h.toFixed(1), minDist: +minDist.toFixed(2), meanX: +meanX.toFixed(2), monotonic };
}

const out = {};
console.log("name    scale  count  width   height  minDist meanX  fillTopDown");
for (const [name, profile] of Object.entries(CANDIDATES)) {
  let scale, pts;
  const found = findScale(profile);
  if (typeof found === "number") { scale = found; pts = generate(profile, scale); }
  else { scale = found.scale; pts = found.pts; }
  // Recenter so the bounding box is centered at (0,0), then shift into a
  // 188×~120 box origin (dots are absolutely positioned from top-left).
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  pts = pts.map(([x, y]) => [+((x - cx) + 94).toFixed(2), +((y - cy) + 60).toFixed(2)]);
  const m = metrics(pts);
  console.log(
    `${name.padEnd(7)} ${scale.toFixed(3)}  ${m.count}    ${m.width}px  ${m.height}px  ${m.minDist}px  ${m.meanX}px  ${m.monotonic}`,
  );
  out[name] = { points: pts, metrics: m, note: profile.note, scale: +scale.toFixed(3) };
}
// Fine-tune scaling: 14px cells, 18px pitch — same placement, scaled by
// 224/188 in x. Height scales the same way: ~120px * 1.19 ≈ 143px.
console.log("\nFine-tune (14px cells, 224px box): heights ≈ main height × 1.19:");
for (const [name, c] of Object.entries(out)) {
  console.log(`  ${name}: ${(c.metrics.height * 1.19).toFixed(1)}px`);
}
console.log("\nBudget: height ≤ 120px (live grid is 117px). Width ≤ 188px.");
writeFileSync("/tmp/honeycomb-organic/points.js", "const ORGANIC = " + JSON.stringify(out, null, 1) + ";\n");
console.log("Wrote /tmp/honeycomb-organic/points.js");
