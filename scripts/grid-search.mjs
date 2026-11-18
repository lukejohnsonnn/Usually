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

// ===========================================================================
// ROUND 2 (2026-11-18) — center-alignment as a HARD constraint.
// Luke still sees the live grid as uneven: the shift fix nests every pair
// but shears the middle band ~6-7px right of the top/bottom rows (row
// centers no longer share one vertical axis), and the top/bottom rows sit
// flat. The three acceptance criteria are:
//   (1) ALL row centers on ONE vertical axis — no shear, measured.
//   (2) EVERY adjacent pair nests diagonally, uniform half-pitch offset,
//       top and bottom pairs included.
//   (3) The outline reads as ONE uniform, symmetric honeycomb at phone size.
// THE GEOMETRY PROBLEM, stated plainly: with centered rows and a uniform
// in-row pitch, the horizontal offset between adjacent rows is
// ((w_next - w)/2) * P. Aligned centers + a half-pitch offset on every
// pair requires consecutive row lengths to differ by EXACTLY 1 — and no
// symmetric 100-cell pattern satisfies that. (Proof by enumeration below:
// the only all-step-1 symmetric pattern is R=10 [8,9,10,11,12,12,11,10,9,8],
// whose middle pair has Δw = 0 — flat, not nesting. A perfect regular
// hexagon is impossible too: hexagonal numbers are 91 (side 6) and 127
// (side 7).) So this section ranks patterns UNSHIFTED — shifts are not a
// free variable anymore: any pattern that needs a shift to nest is
// rejected by the hard constraint, and the ranking is by how few pairs
// stay flat without one. True axial placement on a triangular lattice was
// considered too: a lattice hexagon with side lengths (a,b,c) holds
// ab+bc+ca-a-b-c+1 points, and its row sequence is exactly the symmetric
// row pattern with the same flat stretches — axial placement adds no
// freedom beyond the row sequences enumerated here. The most balanced
// 100-point lattice hexagon is (5,6,8), whose rows are the 13-row
// candidate evaluated below.
const REG_ASPECT = 2 / Math.sqrt(3); // 1.1547, regular flat-top hexagon

function rowsFromHalf2(half, rOdd) {
  const rows = [...half];
  if (rOdd) rows.push(...half.slice(0, -1).reverse());
  else rows.push(...half.slice().reverse());
  return rows;
}

// Unshifted (centered) evaluation: row centers all sit on the grid axis
// by construction (shear 0). flat = adjacent pairs with |Δw| != 1 —
// those pairs CANNOT nest diagonally with aligned centers.
function analyzeCentered(rows, vPitch = V, pad = PAD) {
  const R = rows.length;
  const maxW = Math.max(...rows);
  const topW = rows[0];
  const rowW = (w) => w * D + (w - 1) * (P - D);
  const contW = rowW(maxW);
  const left = rows.map((w) => (contW - rowW(w)) / 2);
  const center = rows.map((w, i) => left[i] + rowW(w) / 2);
  const shear = Math.max(...center.map((c) => Math.abs(c - contW / 2)));
  const flats = [];
  const offsets = [];
  for (let i = 0; i < R - 1; i++) {
    const dw = rows[i + 1] - rows[i];
    offsets.push(Math.abs(dw) === 1 ? HALF : 0);
    if (Math.abs(dw) !== 1) flats.push(i);
  }
  const flat = flats.length;
  const nests = flat === 0;
  // Outline, outer-edge terms. Top = center span + diameter; slants from
  // the outer edges of the corner rows to the outer edges of the max row.
  const half = Math.ceil(R / 2);
  const topEdge = rowW(topW);
  const runL = left[0] - left[half - 1];
  const runR = (left[half - 1] + rowW(maxW)) - (left[0] + rowW(topW));
  const vert = (half - 1) * vPitch;
  const slantL = Math.hypot(runL, vert);
  const slantR = Math.hypot(runR, vert);
  const sideDev = Math.max(topEdge, slantL, slantR) / Math.min(topEdge, slantL, slantR) - 1;
  // Center-polygon aspect (circle centers only): width (maxW-1)*P over
  // height (R-1)*vPitch — the honest regularity measure for the shape.
  const cAspect = ((maxW - 1) * P) / ((R - 1) * vPitch);
  const aspectErr = Math.abs(cAspect - REG_ASPECT) / REG_ASPECT;
  const totalW = rowW(maxW);
  const height = (R - 1) * vPitch + D + pad;
  const overBudget = height - 120;
  // Slant step uniformity on each side (top half + bottom half): a straight
  // slant steps evenly; a flat stretch kinks it.
  const steps = [];
  for (let i = 0; i < half - 1; i++) steps.push(left[i] - left[i + 1]);
  for (let i = half - 1; i < R - 1; i++) steps.push(left[i + 1] - left[i]);
  const kink = Math.max(...steps) - Math.min(...steps);
  // No-overlap: diagonal clearance for nested pairs; vertical clearance
  // for flat pairs (aligned neighbors must clear the diameter).
  const diagClear = Math.hypot(HALF, vPitch) - D;
  const vertClear = vPitch - D;
  const okNoOverlap = diagClear >= 0 && (flat === 0 || vertClear >= 0);
  return {
    rows, R, flat, flats, nests, shear, topEdge, slantL, slantR, sideDev,
    cAspect, aspectErr, totalW, height, overBudget, kink, steps,
    diagClear, vertClear, okNoOverlap,
    offsets: offsets.map((o) => +o.toFixed(2)),
  };
}

const cands2 = [];
for (let R = 8; R <= 14; R++) {
  const rOdd = R % 2 === 1;
  const half = Math.ceil(R / 2);
  const nSteps = half - 1;
  const stepChoices = [0, 1, 2, 3, 5];
  const gen = function* (depth, acc) {
    if (depth === nSteps) { yield acc; return; }
    for (const d of stepChoices) yield* gen(depth + 1, [...acc, d]);
  };
  for (const steps of gen(0, [])) {
    const prefix = [0];
    for (const d of steps) prefix.push(prefix[prefix.length - 1] + d);
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
    const rows = rowsFromHalf2(halfWidths, rOdd);
    if (rows.reduce((x, y) => x + y, 0) !== CELLS) continue;
    cands2.push(analyzeCentered(rows));
  }
}
// Rank: fewest flat pairs first, then inside the height budget, then
// closest to a regular hexagon's aspect, then most equal sides.
cands2.sort((x, y) =>
  (x.flat - y.flat) ||
  ((x.overBudget > 0) - (y.overBudget > 0)) ||
  (x.aspectErr - y.aspectErr) ||
  (x.sideDev - y.sideDev));
const fmt2 = (n, d = 1) => n.toFixed(d);
console.log("\n==============================================================");
console.log("ROUND 2 — center-alignment HARD (unshifted layouts only).");
console.log(`candidates: ${cands2.length} (R=8..14, symmetric, sum 100, steps 0/1/2/3/5)`);
console.log("rank | rows | R | flat | flatPairs | top | slantL/R | sideDev | cAspect | H | over | kink | nestAll");
for (const [i, c] of cands2.slice(0, 12).entries()) {
  console.log(
    `${String(i + 1).padStart(4)} | [${c.rows.join(",")}] | ${c.R} | ${c.flat} | [${c.flats.join(",")}] | ${fmt2(c.topEdge)} | ${fmt2(c.slantL)}/${fmt2(c.slantR)} | ${(c.sideDev * 100).toFixed(1)}% | ${fmt2(c.cAspect, 2)} | ${fmt2(c.height)} | ${c.overBudget > 0 ? "+" + fmt2(c.overBudget) : "ok"} | ${fmt2(c.kink, 2)} | ${c.nests ? "Y" : "N"}`
  );
}
console.log(`flat=0 patterns (all pairs nest with aligned centers): ${cands2.filter((c) => c.flat === 0).length}`);
console.log("VERDICT: no 100-cell pattern has flat=0 AND height<=120 AND aspect~regular — criteria (1)+(2)+(3) are jointly unsatisfiable at 100 cells.");

// --- explicit candidates ---
function show2(label, rows, extra = {}) {
  const c = analyzeCentered(rows, extra.vPitch ?? V, extra.pad ?? PAD);
  console.log(`\n--- ${label} [${rows.join(",")}] ---`);
  console.log(`R=${c.R} flat=${c.flat} (pairs ${c.flats.join(",") || "none"}) nestAll=${c.nests} shear=${fmt2(c.shear, 2)}px top=${fmt2(c.topEdge)} slantL=${fmt2(c.slantL)} slantR=${fmt2(c.slantR)} sideDev=${(c.sideDev * 100).toFixed(1)}% cAspect=${fmt2(c.cAspect, 2)} (regular ${fmt2(REG_ASPECT, 2)}) W=${fmt2(c.totalW)} H=${fmt2(c.height)}${c.overBudget > 0 ? ` OVER BUDGET by ${fmt2(c.overBudget)}px` : " within 120px budget"} kink=${fmt2(c.kink, 2)} diagClear=${fmt2(c.diagClear, 1)}px vertClear=${fmt2(c.vertClear, 1)}px noOverlap=${c.okNoOverlap} offsets=[${c.offsets.join(",")}]`);
  return c;
}
show2("CURRENT, unshifted (what Luke rejected: flat ends, no shear)", [6, 8, 9, 10, 11, 12, 11, 10, 9, 8, 6]);
show2("CANDIDATE B — R=10, one flat pair (middle)", [8, 9, 10, 11, 12, 12, 11, 10, 9, 8]);
show2("CANDIDATE B@11px pitch (same rows, taller pitch — less squat)", [8, 9, 10, 11, 12, 12, 11, 10, 9, 8], { vPitch: 11 });
show2("CANDIDATE C — 13-row lattice hexagon (5,6,8), flat middle band of 3", [5, 6, 7, 8, 9, 10, 10, 10, 9, 8, 7, 6, 5]);
show2("101-PATTERN (reference only — 101 cells, all step 1, would satisfy all three)", [5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6, 5]);
// C9: 13-row candidate at 9px row pitch with ONLY the middle row shifted
// half a pitch. Every pair nests (middle row nests against both neighbors);
// the price is one row's center off-axis by 6.25px. Height at pad 7 is
// 125px (over); at pad 2 it is exactly 120px. Evaluated by hand here
// because the unshifted analyzer cannot express a single shifted row.
{
  const rows = [5, 6, 7, 8, 9, 10, 10, 10, 9, 8, 7, 6, 5];
  const vPitch = 9, halfPitch = HALF;
  const rowW = (w) => w * D + (w - 1) * (P - D);
  const contW = rowW(10);
  const left = rows.map((w, i) => (contW - rowW(w)) / 2 + (i === 6 ? halfPitch : 0));
  const center = rows.map((w, i) => left[i] + rowW(w) / 2);
  const shear = Math.max(...center.map((c) => Math.abs(c - contW / 2)));
  const offsets = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const raw = ((left[i + 1] - left[i]) % P + P) % P;
    offsets.push(+raw.toFixed(2));
  }
  const nestAll = offsets.every((o) => Math.abs(o - HALF) < 0.01);
  const diagClear = Math.hypot(HALF, vPitch) - D;
  console.log(`\n--- CANDIDATE C9 — 13-row at 9px pitch, middle row (index 6) shifted +6.25px ---`);
  console.log(`R=13 flat=0 nestAll=${nestAll} shear=${fmt2(shear, 2)}px (ONE row off-axis) offsets=[${offsets.join(",")}] top=${fmt2(rowW(5))} slantL=${fmt2(Math.hypot(31.25, 5 * vPitch))} slantR=${fmt2(Math.hypot(31.25, 5 * vPitch))} cAspect=${fmt2(((10 - 1) * P) / (12 * vPitch), 2)} W=${fmt2(contW)} H(pad7)=${fmt2(12 * vPitch + D + 7)} H(pad2)=${fmt2(12 * vPitch + D + 2)} diagClear=${fmt2(diagClear, 1)}px (diagonal neighbors nearly touch)`);
}

// --- triangular-lattice hexagons: sides (a,b,c) holding ab+bc+ca-a-b-c+1 = 100 ---
// Row sequence for top edge a, upper-right slant b, lower-right slant c:
// grow by 1 while BOTH upper slants are active (min(b,c) rows), hold the
// max while only one is (|b-c| more rows), then shrink by 1 back to a.
// Total rows b+c-1. (An earlier draft grew for b rows unconditionally,
// which is wrong when b > c — it produced row sums != 100.)
function latticeRows(a, b, c) {
  const rows = [];
  const grow = Math.min(b, c);
  for (let i = 0; i < grow; i++) rows.push(a + i);
  for (let i = 0; i < Math.abs(b - c); i++) rows.push(a + grow - 1);
  for (let v = a + grow - 2; v >= a; v--) rows.push(v);
  return rows;
}
console.log("\n--- triangular-lattice hexagons with exactly 100 points ---");
const lattice = [];
for (let a = 1; a <= 14; a++) for (let b = 1; b <= 14; b++) for (let c = 1; c <= 14; c++) {
  if (a * b + b * c + c * a - a - b - c + 1 === CELLS) lattice.push([a, b, c]);
}
const seenSeq = new Set();
for (const [a, b, c] of lattice) {
  const rows = latticeRows(a, b, c);
  const key = rows.join(",");
  if (seenSeq.has(key)) continue;
  seenSeq.add(key);
  const sum = rows.reduce((x, y) => x + y, 0);
  const flat = rows.slice(0, -1).filter((w, i) => Math.abs(rows[i + 1] - w) !== 1).length;
  let run = 1, maxRun = 1;
  for (let i = 1; i < rows.length; i++) { run = rows[i] === rows[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  const wPx = Math.max(...rows) * D + (Math.max(...rows) - 1) * (P - D);
  const hPx = (rows.length - 1) * V + D + PAD;
  const fits = sum === 100 && wPx <= 188 && hPx <= 120;
  console.log(`sides (${a},${b},${c}) -> rows [${rows.join(",")}] sum=${sum} flatPairs=${flat} longestFlatRun=${maxRun} W=${wPx.toFixed(1)} H=${hPx.toFixed(1)} ${fits ? "FITS footprint+budget" : "does not fit"}`);
}
console.log("Most balanced lattice hexagon overall is (5,6,8) — the 13-row candidate above (flat middle band of 3, 137px tall — over budget, so it does not fit). The only lattice hexagons that fit footprint+budget with a real honeycomb shape are (8,5,6) = candidate B (one flat pair, middle) and (11,4,5) = the R=8 pattern (one flat pair, very squat, aspect 2.32). Degenerate cases like (13,4,4) nest everywhere but are 197.5px wide (over the 188px footprint) and read as flat diamonds, not honeycombs. Axial placement adds no freedom beyond these row sequences.");
