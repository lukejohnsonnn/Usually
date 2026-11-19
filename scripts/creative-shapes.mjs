// Honeydle — creative non-hexagon shapes for the 100-cell grid (2026-11-18).
// Luke asked for MORE options after round 2 proved no symmetric 100-cell
// pattern can be a perfect regular hexagon with aligned centers AND every
// pair nesting diagonally. These are deliberately NOT hexagons: a disc, a
// honey drop (two variants), a beehive/skep, and a honey pot.
// Geometry (same as the live grid): cell 10px, in-row gap 2.5px -> pitch
// P = 12.5px; row pitch V = 10px; grid padding-bottom 7px. Rows are
// CENTERED (no shifts), so row centers all share one axis by construction
// (spread 0) and the adjacent offset between centered rows is (Δw/2)*P.
// No-overlap holds by construction: the closest two centers in adjacent
// rows are either vertically aligned (10px = diameter, touching) or
// offset by 6.25px mod 12.5 (diagonal 11.8px) or more — never under 10px.
// Height = (R-1)*V + 10 + 7; the live 117px grid is the 120px budget.
// Run: node scripts/creative-shapes.mjs
const P = 12.5;
const D = 10;
const V = 10;
const PAD = 7;

const CANDIDATES = {
  // Circle / disc — round, reads as a honey drop seen from above.
  DISC: [5, 7, 9, 11, 12, 12, 12, 11, 9, 7, 5],
  // Honey drop, 11 rows — pointed-ish top (4), fat middle-low, round bottom.
  DROP11: [4, 6, 8, 10, 11, 12, 12, 11, 10, 9, 7],
  // Honey drop, 12 rows — a true 2-dot point at the top; 127px, over budget.
  DROP12: [2, 4, 6, 8, 10, 11, 12, 12, 11, 10, 8, 6],
  // Beehive / skep — arched dome top, straight sides, wide flat base.
  SKEP: [3, 6, 8, 10, 11, 12, 12, 12, 13, 13],
  // Honey pot / jar — wide flat rim on top, gentle taper to a narrow base.
  POT: [10, 11, 12, 12, 12, 11, 10, 9, 7, 6],
};

function analyze(name, rows) {
  const sum = rows.reduce((a, b) => a + b, 0);
  const R = rows.length;
  const maxW = Math.max(...rows);
  const height = (R - 1) * V + D + PAD;
  const width = maxW * D + (maxW - 1) * (P - D);
  // Adjacent offsets between centered rows, mod P (first-cell centers).
  const offsets = [];
  for (let i = 0; i < R - 1; i++) {
    const off = ((((rows[i + 1] - rows[i]) / 2) * P) % P + P) % P;
    offsets.push(off);
  }
  const flat = offsets.filter((o) => Math.abs(o) < 1e-9).length;
  // Min center distance between any two dots in adjacent rows.
  let minDist = Infinity;
  for (let i = 0; i < R - 1; i++) {
    const off = offsets[i];
    // nearest horizontal gap between a dot and the row below's dots
    const h = Math.min(off, P - off);
    minDist = Math.min(minDist, Math.hypot(h, V));
  }
  // Fine-tune height: 14px cells, 14.4px row pitch, 8px padding-bottom.
  const ftHeight = (R - 1) * 14.4 + 14 + 8;
  return { name, rows, sum, R, height, width, offsets, flat, minDist, ftHeight };
}

console.log("name    rows sum height width flatPairs minDist ftHeight  pattern");
for (const [name, rows] of Object.entries(CANDIDATES)) {
  const a = analyze(name, rows);
  const offStr = a.offsets.map((o) => (Math.abs(o) < 1e-9 ? "0" : o.toFixed(2))).join(",");
  console.log(
    `${name.padEnd(7)} ${String(a.R).padEnd(4)} ${a.sum}   ${a.height}px  ${a.width.toFixed(1)}px ${a.flat}         ${a.minDist.toFixed(2)}px  ${a.ftHeight.toFixed(1)}px  [${rows.join(",")}]`,
  );
  console.log(`        offsets: [${offStr}]`);
}
console.log("\nBudget: height ≤ 120px (live grid is 117px). DROP12 is 127px — over budget.");
