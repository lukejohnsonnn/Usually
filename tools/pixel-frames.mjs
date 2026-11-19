// Generates public/css/frames.css: the 9-slice pixel frames (cards, buttons,
// chips, inputs) as SVG data URIs. Usage: node tools/pixel-frames.mjs > public/css/frames.css
const maps = {
  card: { pal: { B: "#2e2e2e", S: "#111111" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  cardgold: { pal: { B: "#2e2e2e", S: "#111111", G: "#cf9a06" }, rows: [
    "..BBB..", ".BGGGB.", "BGSSSGB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  ghost: { pal: { B: "#3a3a3a", S: "#111111", D: "#000000" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", "BDDDDDB", ".BDDDB.", "..BBB.."], slice: "3 3 4 3" },
  ghostdown: { pal: { B: "#3a3a3a", S: "#161616" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  primary: { pal: { Y: "#ffd60a", H: "#fff09a", D: "#a67c00", K: "#000000" }, rows: [
    "..YYY..", ".YHHHY.", "YHYYYYY", "YYYYYYY", "YYYYYYY", "DYYYYYD", ".DDDDD.", "..DDD.."], slice: "3 3 4 3" },
  primarydown: { pal: { Y: "#f0c800", D: "#a67c00" }, rows: [
    "..YYY..", ".YYYYY.", "YYYYYYY", "YYYYYYY", "YYYYYYY", ".DYYYD.", "..DDD.."] },
  chip: { pal: { B: "#6b5418", S: "#241d00" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  input: { pal: { B: "#3a3a3a", S: "#0a0a0a" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  inputfocus: { pal: { B: "#ffd60a", S: "#0a0a0a" }, rows: [
    "..BBB..", ".BSSSB.", "BSSSSSB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
  toast: { pal: { Y: "#ffd60a" }, rows: [
    "..YYY..", ".YYYYY.", "YYYYYYY", "YYYYYYY", "YYYYYYY", ".YYYYY.", "..YYY.."] },
  sheet: { pal: { B: "#3a3112", S: "#111111", G: "#cf9a06" }, rows: [
    "..BBB..", ".BGGGB.", "BGSSSGB", "BSSSSSB", "BSSSSSB", ".BSSSB.", "..BBB.."] },
};
let css = ":root {\n";
for (const [name, m] of Object.entries(maps)) {
  const w = m.rows[0].length, h = m.rows.length;
  let rects = "";
  m.rows.forEach((r, y) => [...r].forEach((c, x) => { if (m.pal[c]) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${m.pal[c]}'/>`; }));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' shape-rendering='crispEdges'>${rects}</svg>`;
  const uri = "data:image/svg+xml," + svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E");
  css += `  --px-${name}: url("${uri}") ${m.slice || "3"} fill;\n`;
}
css += "}\n";
process.stdout.write(css);
