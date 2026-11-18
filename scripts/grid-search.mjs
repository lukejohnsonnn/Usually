// Honeydle bug 2 — numeric search over 100-cell honeycomb row patterns.
// Enumerates symmetric row arrangements (10-13 rows, plus 9 as a reference),
// computes per-row half-pitch shifts that make EVERY adjacent pair nest
// diagonally, and scores each candidate on outline regularity, edge
// straightness, symmetry, and the one-screen budgets.
// Geometry (fixed, current values): cell 10px, in-row gap 2.5px -> pitch
// p = 12.5px; row pitch v = 10px; grid padding-bottom 7px.
// Run: node scripts/grid-search.mjs
const P = 12.5;   // horizontal pitch (cell 10 + gap 2.5)
const D = 10;     // cell diameter
const V = 10;     // row pitch
const PAD = 7;    // .grid padding-bottom
const CELLS = 100;
const HALF = P / 2; // 6.25 — the diagonal-nesting offset

// Build the symmetric row list from top-half widths.
// R odd:  [w0..w_{h-1}..w0] with w_{h-1} = max (single middle row)
// R even: [w0..w_{h-1}, w_{h-1}..w0] with w_{h-1} = max (two middle rows)
function rowsFromHalf(half, rOdd) {
  const rows = [...half];
  if (rOdd) rows.push(...half.slice(0, -1).reverse());
  else rows.push(...half.slice().reverse());
  return rows;
}

// For a width list, find per-row shifts s[i] in {0, HALF} (top row anchored
// at 0) such that every adjacent pair nests: relative offset between
// adjacent row centers must be HALF mod P. Returns null if impossible
// (never happens: the recurrence always has a solution).
function shiftsFor(widths) {
  const s = [0];
  for (let i = 0; i < widths.length - 1; i++) {
    const dw = widths[i + 1] - widths[i];
    // centered relative offset = (dw/2)*P; need total offset = HALF (mod P)
    // -> shift delta = HALF - (dw/2)*P (mod P), which is 0 or HALF.
    let delta = ((HALF - (dw / 2) * P) % P + P) % P;
    if (Math.abs(delta - HALF) < 1e-9) delta = HALF;
    else if (Math.abs(delta) < 1e-9 || Math.abs(delta - P) < 1e-9) delta = 0;
    else return null; // dw fractional — cannot happen for integer widths
    s.push((s[i] + delta) % P);
  }
  return s;
}

function analyze(rows) {
  const R = rows.length;
  const maxW = Math.max(...rows);
  const topW = rows[0];
  const s = shiftsFor(rows);
  if (!s) return null;
  // Absolute left edge of each row (container width = widest row, centered
  // rows then shifted by s[i]).
  const rowPx = (w) => w * D + (w - 1) * (P - D); // w*10 + (w-1)*2.5
  const contW = rowPx(maxW);
  const left = rows.map((w, i) => (contW - rowPx(w)) / 2 + s[i]);
  const right = rows.map((w, i) => left[i] + rowPx(w));
  const center = rows.map((w, i) => (left[i] + right[i]) / 2);
  const gridCenter = contW / 2;

  // (a) nesting: relative center offset of every adjacent pair, mod P.
  const nest = [];
  for (let i = 0; i < R - 1; i++) {
    // first-cell center offset = (left[i+1]-left[i]) mod P, in [0,P)
    let off = ((left[i + 1] - left[i]) % P + P) % P;
    nest.push(off);
  }
  const nests = nest.every((o) => Math.abs(o - HALF) < 1e-9);

  // (b) outline: top edge, slant sides (endpoint to endpoint).
  const half = Math.ceil(R / 2); // rows from top to max, inclusive
  const topEdge = rowPx(topW);
  const runL = left[0] - left[half - 1];
  const runR = right[half - 1] - right[0];
  const vert = (half - 1) * V;
  const slantL = Math.hypot(runL, vert);
  const slantR = Math.hypot(runR, vert);
  const sideDev = Math.max(topEdge, slantL, slantR) / Math.min(topEdge, slantL, slantR) - 1;
  const angL = (Math.atan2(vert, runL) * 180) / Math.PI;
  const angR = (Math.atan2(vert, runR) * 180) / Math.PI;
  const angleErr = (Math.abs(angL - 60) + Math.abs(angR - 60)) / 2;

  // edge straightness: per-step horizontal runs along each slant (top half
  // and bottom half separately); a straight slant has uniform steps.
  const steps = [];
  for (let i = 0; i < half - 1; i++) steps.push(left[i] - left[i + 1], right[i + 1] - right[i]);
  for (let i = half - 1; i < R - 1; i++) steps.push(left[i + 1] - left[i], right[i] - right[i + 1]);
  const kink = Math.max(...steps) - Math.min(...steps);

  // (c) symmetry: max row-center deviation from grid center; top vs bottom.
  const shear = Math.max(...center.map((c) => Math.abs(c - gridCenter)));
  const topBottomOff = Math.abs(center[0] - center[R - 1]);

  // (d) budgets
  const totalW = Math.max(...right) - Math.min(...left);
  const height = (R - 1) * V + D + PAD;
  const aspect = totalW / height;
  const aspectErr = Math.abs(aspect - 2 / Math.sqrt(3)) / (2 / Math.sqrt(3));

  // min center distance between cells of adjacent rows (no-overlap check):
  // nearest neighbours are offset by HALF horizontally, V vertically.
  const diag = Math.hypot(HALF, V);

  // fine-tune grid at the same pattern (14px cells, 18px pitch, 14.4 row pitch)
  const ftW = maxW * 14 + (maxW - 1) * 4;
  const ftH = (R - 1) * 14.4 + 14 + 8;

  // combined score (lower = better): side deviation + slant-angle error +
  // aspect error + kink + shear, all in comparable ~percent/px units.
  // kinkSum = total deviation of slant steps from the median step: a
  // single jogged step (current pattern) costs far less than a wavy
  // outline with a jog at every row (mixed 1/3-step patterns).
  const sorted = [...steps].sort((a, b) => a - b);
  const medianStep = sorted[Math.floor(sorted.length / 2)];
  const kinkSum = steps.reduce((s, x) => s + Math.abs(x - medianStep), 0);
  const score = 100 * sideDev + angleErr + 50 * aspectErr + 2 * kink + kinkSum + 2 * shear;

  return {
    rows, R, nests, topEdge, slantL, slantR, sideDev, angL, angR, angleErr,
    kink, kinkSum, shear, topBottomOff, totalW, height, aspect, aspectErr, diag,
    ftW, ftH, score,
    steps: steps.map((x) => +x.toFixed(2)),
    shifts: s.map((x) => +x.toFixed(2)),
  };
}

const results = [];
for (let R = 9; R <= 13; R++) {
  const rOdd = R % 2 === 1;
  const half = Math.ceil(R / 2);
  const nSteps = half - 1;
  // steps d_j in {1,2,3,5}; widths must stay >= 1 and max <= 20 (sanity).
  const stepChoices = [1, 2, 3, 5];
  const gen = function* (depth, acc) {
    if (depth === nSteps) { yield acc; return; }
    for (const d of stepChoices) yield* gen(depth + 1, [...acc, d]);
  };
  for (const steps of gen(0, [])) {
    // solve for top width a from the sum = 100, then check integer + valid.
    // widths: w_i = a + prefix sums; sum over full symmetric rows.
    const prefix = [0];
    for (const d of steps) prefix.push(prefix[prefix.length - 1] + d);
    // sum = (R odd) 2*sum(w_0..w_{h-2}) + w_{h-1}
    //       (R even) 2*sum(w_0..w_{h-1})
    let coefA, constSum;
    if (rOdd) {
      coefA = 2 * (half - 1) + 1;
      constSum = 2 * prefix.slice(0, -1).reduce((x, y) => x + y, 0) + prefix[prefix.length - 1];
    } else {
      coefA = 2 * half;
      constSum = 2 * prefix.reduce((x, y) => x + y, 0);
    }
    const rem = CELLS - constSum;
    if (rem % coefA !== 0) continue;
    const a = rem / coefA;
    if (!Number.isInteger(a) || a < 1) continue;
    const halfWidths = prefix.map((p) => a + p);
    if (halfWidths.some((w) => w < 1 || w > 20)) continue;
    const rows = rowsFromHalf(halfWidths, rOdd);
    if (rows.reduce((x, y) => x + y, 0) !== CELLS) continue;
    const an = analyze(rows);
    if (an) results.push({ ...an, stepsIn: steps });
  }
}

// The current pattern, for reference (it is in the enumeration too).
results.sort((x, y) => x.score - y.score);
const fmt = (n, d = 1) => n.toFixed(d);
console.log(`candidates: ${results.length} (R=9..13, symmetric, sum 100)`);
console.log("rank | rows | R | nest | top | slantL/R | sideDev | angL/R | kink | kinkSum | shear | W | H | aspect | ftW | score");
for (const [i, c] of results.entries()) {
  console.log(
    `${String(i + 1).padStart(4)} | [${c.rows.join(",")}] | ${c.R} | ${c.nests ? "Y" : "N"} | ${fmt(c.topEdge, 1)} | ${fmt(c.slantL, 1)}/${fmt(c.slantR, 1)} | ${(c.sideDev * 100).toFixed(1)}% | ${fmt(c.angL, 1)}/${fmt(c.angR, 1)} | ${fmt(c.kink, 2)} | ${fmt(c.kinkSum, 1)} | ${fmt(c.shear, 2)} | ${fmt(c.totalW, 1)} | ${fmt(c.height, 1)} | ${fmt(c.aspect, 2)} | ${fmt(c.ftW, 0)} | ${fmt(c.score, 1)}`
  );
}
console.log("\nheight budget: 120px — R=12 needs 127px, R=13 needs 137px (over budget at current cell size).");
console.log("fine-tune box is 224px wide — ftW > 224 needs the .grid.small max-width raised.");
console.log("\n--- top 5 detail (steps = per-row left-edge runs along the slants) ---");
for (const c of results.slice(0, 5)) {
  console.log(`[${c.rows.join(",")}] score=${fmt(c.score, 1)} nest=${c.nests} steps=[${c.steps.join(",")}] shifts=[${c.shifts.join(",")}] diagClear=${fmt(c.diag - D, 1)}px ftH=${fmt(c.ftH, 1)}px`);
}
const cur = results.find((c) => JSON.stringify(c.rows) === JSON.stringify([6, 8, 9, 10, 11, 12, 11, 10, 9, 8, 6]));
console.log("\n--- current pattern [6,8,9,10,11,12,11,10,9,8,6] (with shifts) ---");
console.log(`score=${fmt(cur.score, 1)} nest=${cur.nests} top=${fmt(cur.topEdge, 1)} slantL=${fmt(cur.slantL, 1)} slantR=${fmt(cur.slantR, 1)} sideDev=${(cur.sideDev * 100).toFixed(1)}% ang=${fmt(cur.angL, 1)}/${fmt(cur.angR, 1)} kink=${fmt(cur.kink, 2)} shear=${fmt(cur.shear, 2)} W=${fmt(cur.totalW, 1)} H=${fmt(cur.height, 1)} steps=[${cur.steps.join(",")}] shifts=[${cur.shifts.join(",")}]`);
// Step-1-only impossibility check: consecutive rows step by exactly 1 cell.
console.log("\n--- 'consecutive rows step by exactly one cell' (all d=1) ---");
for (let R = 9; R <= 13; R++) {
  const rOdd = R % 2 === 1;
  const half = Math.ceil(R / 2);
  const prefix = Array.from({ length: half }, (_, i) => i);
  let coefA, constSum;
  if (rOdd) { coefA = 2 * (half - 1) + 1; constSum = 2 * prefix.slice(0, -1).reduce((x, y) => x + y, 0) + prefix[prefix.length - 1]; }
  else { coefA = 2 * half; constSum = 2 * prefix.reduce((x, y) => x + y, 0); }
  const rem = CELLS - constSum;
  console.log(`R=${R}: need a = ${rem}/${coefA} = ${(rem / coefA).toFixed(3)} ${rem % coefA === 0 ? "INTEGER — possible" : "not integer — impossible"}`);
}
