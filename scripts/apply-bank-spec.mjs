// Applies a bank patch spec (same schema as audit/sense-sweep-spec.json) to data/bank.json.
// Usage: node scripts/apply-bank-spec.mjs [spec-path]  (default: audit/sense-sweep-spec.json)
// Order: renames -> variantRemovals -> variantMoves -> merges -> removals -> refills -> renumber.
// All rank references in the spec are ORIGINAL rank numbers (pre-application).
// Refill `position` is the 1-based position in the FINAL list. Writes only if all validations pass.
import fs from "node:fs";
import { canonicalTokens } from "../lib/game.js";

const REPO = new URL("..", import.meta.url).pathname;
const SPEC_PATH = process.argv[2] || `${REPO}/audit/sense-sweep-spec.json`;
const bank = JSON.parse(fs.readFileSync(`${REPO}/data/bank.json`, "utf8"));
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));

const warnings = [];
const byId = new Map(bank.questions.map((q) => [q.id, q]));

function findRank(list, rank) {
  const slot = list.find((s) => s.rank === rank);
  if (!slot) throw new Error(`rank ${rank} not found`);
  return slot;
}

for (const entry of spec.questions || []) {
  const q = byId.get(entry.id);
  if (!q) throw new Error(`question ${entry.id} not found in bank`);
  const origCount = q.textAnswers.length;
  const origTop1 = q.top1;
  const list = q.textAnswers.map((s) => ({ rank: s.rank, texts: [...s.texts] }));

  // 1. renames (full texts replacement; head becomes newCanonicalAnswer)
  for (const r of entry.renames || []) {
    const slot = findRank(list, r.rank);
    slot.texts = [...r.newTexts];
    if (slot.texts[0] !== r.newCanonicalAnswer) throw new Error(`Q${entry.id} rename r${r.rank}: head mismatch`);
  }
  // 2. variantRemovals
  for (const vr of entry.variantRemovals || []) {
    const slot = findRank(list, vr.rank);
    const i = slot.texts.indexOf(vr.variant);
    if (i === -1) { warnings.push(`Q${entry.id} r${vr.rank}: variantRemoval "${vr.variant}" not present (already gone?)`); continue; }
    slot.texts.splice(i, 1);
    if (slot.texts.length === 0) throw new Error(`Q${entry.id} r${vr.rank}: emptied by variantRemoval`);
  }
  // 3. variantMoves
  for (const vm of entry.variantMoves || []) {
    const from = findRank(list, vm.fromRank);
    const into = findRank(list, vm.intoRank);
    const i = from.texts.indexOf(vm.variant);
    if (i === -1) { warnings.push(`Q${entry.id} r${vm.fromRank}->r${vm.intoRank}: variantMove "${vm.variant}" not present in source`); continue; }
    from.texts.splice(i, 1);
    if (!into.texts.includes(vm.variant)) into.texts.push(vm.variant);
    if (from.texts.length === 0) throw new Error(`Q${entry.id} r${vm.fromRank}: emptied by variantMove`);
  }
  // 4. merges (move variants, mark source for deletion)
  const toDelete = new Set();
  for (const m of entry.merges || []) {
    const from = findRank(list, m.fromRank);
    const into = findRank(list, m.intoRank);
    for (const v of m.variantsToMove) {
      const i = from.texts.indexOf(v);
      if (i === -1) { warnings.push(`Q${entry.id} merge r${m.fromRank}->r${m.intoRank}: variant "${v}" not present in source`); continue; }
      from.texts.splice(i, 1);
      if (!into.texts.includes(v)) into.texts.push(v);
    }
    toDelete.add(m.fromRank);
  }
  // 5. removals
  for (const rem of entry.removals || []) {
    findRank(list, rem.rank);
    toDelete.add(rem.rank);
  }
  // 6. drop deleted ranks, keep order
  let kept = list.filter((s) => !toDelete.has(s.rank));
  // 7. refills, ascending position (final-list 1-based)
  const refills = [...(entry.refills || [])].sort((a, b) => a.position - b.position);
  for (const rf of refills) {
    const idx = rf.position - 1;
    if (idx < 0 || idx > kept.length) throw new Error(`Q${entry.id} refill "${rf.canonicalAnswer}" position ${rf.position} out of range (kept=${kept.length})`);
    kept.splice(idx, 0, { rank: rf.position, texts: [...rf.variants] });
    if (kept[idx].texts[0] !== rf.canonicalAnswer) throw new Error(`Q${entry.id} refill head mismatch`);
  }
  // 8. renumber contiguously
  kept.forEach((s, i) => { s.rank = i + 1; });
  // 9. validate this question
  if (kept.length !== origCount) throw new Error(`Q${entry.id}: count changed ${origCount} -> ${kept.length}`);
  if (kept.length < 75) throw new Error(`Q${entry.id}: below 75 ranks (${kept.length})`);
  if (q.top1 !== origTop1) throw new Error(`Q${entry.id}: top1 changed`);
  if (kept[0].texts[0] !== origTop1) throw new Error(`Q${entry.id}: rank 1 head != top1`);
  for (const rf of refills) {
    if (kept[rf.position - 1].texts[0] !== rf.canonicalAnswer) throw new Error(`Q${entry.id}: refill "${rf.canonicalAnswer}" not at position ${rf.position}`);
  }
  const seen = new Map();
  let withinRankDups = 0;
  for (const s of kept) {
    for (const t of s.texts) {
      const key = JSON.stringify(canonicalTokens(t));
      if (seen.has(key) && seen.get(key) !== s.rank) throw new Error(`Q${entry.id}: canonical dup "${t}" in ranks ${seen.get(key)} and ${s.rank}`);
      if (seen.has(key)) withinRankDups++;
      seen.set(key, s.rank);
    }
  }
  if (withinRankDups) warnings.push(`Q${entry.id}: ${withinRankDups} within-rank canonical dup variant(s) (pre-existing, harmless — same rank)`);
  q.textAnswers = kept;
  console.log(`Q${entry.id}: ok (${kept.length} ranks, ${(entry.merges||[]).length} merges, ${(entry.removals||[]).length} removals, ${refills.length} refills, ${(entry.renames||[]).length} renames)`);
}

// Whole-bank validation: every text prompt contiguous, >=75, no cross-rank canonical dup, top1 consistent.
for (const q of bank.questions.filter((x) => x.kind === "text")) {
  const list = q.textAnswers;
  list.forEach((s, i) => { if (s.rank !== i + 1) throw new Error(`Q${q.id}: rank not contiguous at index ${i}`); });
  if (list.length < 75) throw new Error(`Q${q.id}: below 75 ranks`);
  if (list[0].texts[0] !== q.top1) throw new Error(`Q${q.id}: rank 1 head != top1`);
  const seen = new Map();
  for (const s of list) for (const t of s.texts) {
    const key = JSON.stringify(canonicalTokens(t));
    if (seen.has(key) && seen.get(key) !== s.rank) throw new Error(`Q${q.id}: canonical dup "${t}"`);
    seen.set(key, s.rank);
  }
}

console.log(`\nWARNINGS (${warnings.length}):`);
for (const w of warnings) console.log("  - " + w);
console.log("\nAll validations passed. Writing bank.json...");
fs.writeFileSync(`${REPO}/data/bank.json`, JSON.stringify(bank, null, 2) + "\n");
console.log("Wrote data/bank.json");
