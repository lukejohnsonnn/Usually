// Merge harvested wave files (bank.json + wave2..6.json) into repo/data/bank.json.
// Run: node scripts/merge-bank.mjs
// Rules: dedupe by id; conflicting stored answers are reported and the FIRST
// value wins (harvested values were re-verified identical across waves).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harvestDir = path.resolve(__dirname, "../../harvest");
const outPath = path.resolve(__dirname, "../data/bank.json");

const files = ["bank.json", "wave2.json", "wave3.json", "wave4.json", "wave5.json", "wave6.json"];
const byId = new Map(); // id -> question object
const conflicts = [];

function upsert(q) {
  const prev = byId.get(q.id);
  if (!prev) { byId.set(q.id, q); return; }
  if (prev.answer !== q.answer) {
    conflicts.push({ id: q.id, first: prev.answer, later: q.answer });
  }
  // keep first-seen text/category; fill in missing note
  if (!prev.note && q.note) prev.note = q.note;
  if (q.votable === false) prev.votable = false;
}

for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(harvestDir, f), "utf8"));
  for (const g of d.guess || []) {
    upsert({ id: g.id, kind: "guess", category: g.category, text: g.text, answer: g.answer, note: g.note || null, finale: false, votable: g.votable !== false });
  }
  for (const s of d.split || []) {
    upsert({ id: s.id, kind: "split", category: s.category, text: s.text, answer: s.answer, note: s.note || null, leftLabel: s.left, rightLabel: s.right, finale: false, votable: true });
  }
  for (const fn of d.finale || []) {
    upsert({ id: fn.id, kind: "guess", category: fn.category, text: fn.text, answer: fn.answer, note: fn.note || null, finale: true, votable: false });
  }
  for (const t of d.text || []) {
    const answers = new Map(); // rank -> Set(texts)
    for (const a of t.answers || []) {
      if (!answers.has(a.rank)) answers.set(a.rank, new Set());
      answers.get(a.rank).add(a.text);
    }
    byId.set(t.id, {
      id: t.id, kind: "text", category: "Crowd's #1", text: t.text,
      answer: null, note: null, finale: false, votable: false,
      top1: t.top1 || null,
      textAnswers: [...answers.entries()].map(([rank, texts]) => ({ rank, texts: [...texts] })),
      unlisted: [...(t.unlisted || [])],
    });
  }
  for (const add of d.textAnswerAdditions || []) {
    const q = byId.get(add.id);
    if (!q) { console.warn(`addition for unknown text id ${add.id} in ${f}`); continue; }
    for (const a of add.answers || []) {
      const slot = q.textAnswers.find((x) => x.rank === a.rank);
      if (slot) { if (!slot.texts.includes(a.text)) slot.texts.push(a.text); }
      else q.textAnswers.push({ rank: a.rank, texts: [a.text] });
    }
    q.textAnswers.sort((x, y) => x.rank - y.rank);
  }
  for (const u of d.textUnlistedAdditions || []) {
    const q = byId.get(u.id);
    if (!q) { console.warn(`unlisted addition for unknown text id ${u.id} in ${f}`); continue; }
    for (const a of u.answers || []) if (!q.unlisted.includes(a)) q.unlisted.push(a);
  }
}

// Vote prompts harvested from the live game's Contribute screen (2026-11-16).
const votePrompts = {
  142: "Could you sink a half-court shot within 5 tries?",
  70: "Have you ever appeared on TV?",
  31: "Have you rewatched your favorite show more than three times?",
  35: "Have you ever bought something just because it was on sale?",
  53: "Pick your side",
};
for (const [id, prompt] of Object.entries(votePrompts)) {
  const q = byId.get(Number(id));
  if (q) q.votePrompt = prompt;
}

const questions = [...byId.values()].sort((a, b) => a.id - b.id);
const counts = {
  guess: questions.filter((q) => q.kind === "guess" && !q.finale).length,
  split: questions.filter((q) => q.kind === "split").length,
  finale: questions.filter((q) => q.finale).length,
  text: questions.filter((q) => q.kind === "text").length,
};
counts.total = questions.length;
counts.votable = questions.filter((q) => q.votable).length;

const out = {
  meta: {
    app: "Usually",
    harvested: "2026-11-16",
    source: "Muse artifact the-crowd-live, via published actions only (getToday/startPlay/submitGuess/submitText/getContribute/getStats)",
    note: "Every stored answer was verified by submitting a guess in the live game. Text banks hold only verified ranked answers; anything else scores the 5-point floor. Full 32-34-answer text lists are never exposed by the live server and are NOT in this bank.",
    counts,
    knownGap: "Live healthCheck reported 139 bank questions; this bank has 119 (120 harvested, minus the retired Australia finale id 38, removed 2026-11-16). Suspected unharvested classic-guess ids: 7, 15, 21, 23, 26, 27, 36, 57, 58, 61, 74, 139, 146 (and id 13, whose votePrompt is known but whose answer was never verified — deliberately excluded). Live votableTotal was 95 vs 78 in this seed; the gap is the unharvested questions, not wrong flags. Add them later via scripts/seed.js once verified; do not invent values.",
  },
  questions,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log("counts:", JSON.stringify(counts));
console.log("conflicts:", conflicts.length ? conflicts : "none");
console.log("wrote", outPath);
