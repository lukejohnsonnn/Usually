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
  // outline are the reliable build. Rows are centered, so a one-cell step
  // staggers the next row by half a cell pitch — a proper hex lattice.
  // Circle geometry (see VERIFICATION.md): main cells 10px diameter,
  // 2.5px in-row gap (12.5px pitch), 10px row pitch; fine-tune cells
  // 14px, 4px gap (18px pitch), 14.4px row pitch. The outline is a
  // hexagon with near-equal sides: top edge 62.5px, each slant side
  // hypot(3*12.5, 5*10) = 62.5px — 0% apart (the slant angle is 53.1°,
  // not 60°, the closest the 100-cell count allows). No overlap: the
  // diagonal center distance sqrt(6.25^2 + 10^2) = 11.8px clears the
  // 10px diameter, and vertically aligned neighbors touch exactly
  // (pitch = diameter), never overlap. Grid height 117px, inside the
  // 120px one-screen budget. Fill order is still row-major (index i runs
  // across rows in order), so all guess/reveal math is untouched — only
  // the layout changed. Each row is a .hrow flex row so it centers
  // itself; the dots stay flat .dot children of their row.
  const ROWS = [6, 8, 9, 10, 11, 12, 11, 10, 9, 8, 6];
  container.innerHTML = "";
  let i = 0;
  for (const len of ROWS) {
    const row = document.createElement("div");
    row.className = "hrow";
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

