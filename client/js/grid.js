// Honeydle — honeycomb grid rendering (renderGrid).
// Depends on: nothing (pure DOM builder). Loaded after core.js.

// ------------------------------------------------------------ grid rendering
function renderGrid(container, spec) {
  // One shared 100-dot grid (188px) for answering and reveal, same component.
  // Black/yellow/white only — four instantly distinct reveal states:
  // real-number-only = white, guess-only = dark + yellow inset ring, overlap
  // (in both) = solid bright-yellow FILL, unlit = charcoal. Yellow fill =
  // you, everywhere on the reveal.
  // Reveal Split {split:{left,right}, playerSplit}: halves by the real number's
  // split (white / deep amber); the dots up to the player's split are
  // bright-yellow filled, so the yellow region is the player's split and
  // the white/amber after it is the real number's.
  // Entry specs (while answering, never any real-number data):
  //   {entry:"guess", value} — dark fill + inset yellow ring on exactly
  //     round(value) dots in row-major order
  //   {entry:"split", left} — white/deep-amber halves, NO yellow ring at all
  //   {entry:"fine", value} — fine-tune hundredths: yellow 28% mix + ring
  // Big-honeycomb shape (2026-11-18): the 100 cells are laid out in 11 rows
  // that grow then shrink — [6,8,9,10,11,12,11,10,9,8,6] — so together
  // they form one big hexagon. The cells are CIRCLES now, not hexagons:
  // the hex cells looked broken and fiddly, circles in the same hex
  // outline are the reliable build.
  // DIAGONAL NESTING (2026-11-18 bug 2): centered rows nest diagonally
  // only when the width step is odd — the relative offset between adjacent
  // centered rows is (Δw/2) * pitch, a half pitch for Δw odd, a full pitch
  // (vertical alignment, no nesting) for Δw even. The 6→8 step at the top
  // and the 8→6 step at the bottom are both Δw = 2, so the top and bottom
  // rows sat flat over the rows next to them instead of nesting into them.
  // The fix is a half-pitch shift on rows 1–9 (SHIFTS below): the shift
  // flips exactly at the even steps, so every adjacent pair is offset by
  // exactly half a pitch and every circle sits in the pocket between two
  // circles of the neighboring row. The shift is a translateX on the row
  // (6.25px main, 9px fine-tune — half the in-row pitch in each size), so
  // row-major fill order, the four color states, and the staggered fill
  // animation are all untouched. Cost, measured (see VERIFICATION.md and
  // scripts/grid-search.mjs): the outline is no longer left-right
  // symmetric in its slant lengths — top edge 72.5px, left slant
  // hypot(31.25, 50) = 59.0px, right slant hypot(43.75, 50) = 66.4px
  // (mean slant 62.7px, 13.5% off the top edge; the old centered outline
  // was 62.5/62.5). The left slant is perfectly straight (uniform 6.25px
  // steps); the right slant has one 18.75px step at each end. The numeric
  // search over 409 symmetric 100-cell patterns (9–13 rows) ranks this
  // first: the all-odd-step alternatives that need no shift are wider and
  // flatter (top 60 vs slant 75.3, slant angle 41.6° vs 60° ideal) and read
  // as squashed hexagons, and a perfect regular hexagon is impossible with
  // exactly 100 cells (91 or 127 would be). A step-by-exactly-one-cell
  // pattern is impossible too: only R=10 admits one ([8,9,10,11,12,12,…]),
  // and its top edge (97.5px) is 2.1× its slant (47.2px) — and its middle
  // pair (Δw = 0) still needs a shear-inducing shift to nest at all.
  // Circle geometry (see VERIFICATION.md): main cells 10px diameter,
  // 2.5px in-row gap (12.5px pitch), 10px row pitch; fine-tune cells
  // 14px, 4px gap (18px pitch), 14.4px row pitch. No overlap: the
  // diagonal center distance sqrt(6.25^2 + 10^2) = 11.8px clears the
  // 10px diameter, and vertically aligned neighbors touch exactly
  // (pitch = diameter), never overlap. Grid height 117px, inside the
  // 120px one-screen budget. Fill order is still row-major (index i runs
  // across rows in order), so all guess/reveal math is untouched — only
  // the layout changed. Each row is a .hrow flex row so it centers
  // itself; the dots stay flat .dot children of their row.
  const ROWS = [6, 8, 9, 10, 11, 12, 11, 10, 9, 8, 6];
  // Half-pitch shifts, one per row (1 = shift right by half the in-row
  // pitch). The shift flips exactly at the even width steps (6→8, 8→6);
  // top and bottom rows stay centered.
  const SHIFTS = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
  container.innerHTML = "";
  let i = 0;
  for (let r = 0; r < ROWS.length; r++) {
    const len = ROWS[r];
    const row = document.createElement("div");
    row.className = "hrow";
    if (SHIFTS[r] === 1) row.classList.add("shift");
    for (let p = 0; p < len; p++, i++) {
      const d = document.createElement("div");
      d.className = "dot";
      if (spec.entry === "split") {
        if (i < spec.left) d.classList.add("white");
        else d.classList.add("amber");
      } else if (spec.entry === "fine") {
        if (i < Math.round(spec.value)) d.classList.add("ft");
      } else if (spec.entry === "guess") {
        if (i < Math.round(spec.value)) d.classList.add("gold");
      } else if (spec.split) {
        if (i < spec.split.left) d.classList.add("white");
        else d.classList.add("amber");
        if (spec.playerSplit != null && i < spec.playerSplit) d.classList.add("gold");
      } else {
        if (i < spec.crowd) d.classList.add("white");
        if (spec.guess != null && i < Math.round(spec.guess)) d.classList.add("gold");
      }
      row.appendChild(d);
    }
    container.appendChild(row);
  }
}

