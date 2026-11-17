// Pure game logic for Usually — no I/O, no DB. Fully unit-testable.
// Scoring, fuzzy text matching, deterministic daily composition, ET dates.

export const TIERS = [
  { maxDiff: 0, points: 175, name: "Bullseye" },
  { maxDiff: 1, points: 100, name: "Dead On" },
  { maxDiff: 3, points: 90, name: "Razor Close" },
  { maxDiff: 6, points: 75, name: "Close" },
  { maxDiff: 10, points: 55, name: "Warm" },
  { maxDiff: 15, points: 35, name: "Lukewarm" },
  { maxDiff: 25, points: 15, name: "Cold" },
  { maxDiff: Infinity, points: 5, name: "Way Off" },
];

export function tierForDiff(diff) {
  for (const t of TIERS) if (diff <= t.maxDiff) return t;
  return TIERS[TIERS.length - 1];
}

/** Score a % guess. Sub-1% answers are scored in hundredths on the same curve. */
export function scoreGuess(answer, guess) {
  const a = Number(answer);
  const g = Number(guess);
  let diff;
  if (a < 1) diff = Math.round(Math.abs(a - g) * 100);
  else diff = Math.abs(Math.round(a) - Math.round(g));
  const tier = tierForDiff(diff);
  return { points: tier.points, tier: tier.name, diff };
}

/** Score a text round by the rank of the submitted answer (null = unlisted). */
export function scoreText(rank, blank = false) {
  if (blank) return { points: 0, tier: "Blank", rank: null };
  if (rank == null) return { points: 5, tier: "Way Off", rank: null };
  let points;
  if (rank === 1) points = 175;
  else if (rank <= 3) points = 100;
  else if (rank <= 6) points = 90;
  else if (rank <= 10) points = 75;
  else if (rank <= 15) points = 55;
  else if (rank <= 20) points = 35;
  else if (rank <= 30) points = 15;
  else points = 5;
  return { points, tier: tierForDiff(rank === 1 ? 0 : rank <= 3 ? 1 : rank <= 6 ? 3 : rank <= 10 ? 6 : rank <= 15 ? 10 : rank <= 20 ? 15 : rank <= 30 ? 25 : 99).name, rank };
}

/** Validate a % guess: 0–100; whole numbers at >=1%, up to 2 decimals below 1%. */
export function validateGuess(guess) {
  const g = Number(guess);
  if (!Number.isFinite(g) || g < 0 || g > 100) return "Guess must be between 0 and 100.";
  if (g >= 1 && !Number.isInteger(g)) return "Whole numbers only at 1% and above — decimals live below 1%.";
  if (g < 1 && Math.round(g * 100) !== g * 100) return "Below 1%, use hundredths (e.g. 0.25).";
  return null;
}

// ---------- text matching ----------

export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singular(w) {
  if (w.endsWith("ies") && w.length > 3) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") || w.endsWith("ches") || w.endsWith("shes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Find the rank of a submitted answer in a text question's bank.
 * textAnswers: [{rank, texts:[]}], unlisted: [strings known NOT to be listed].
 * Returns {rank} (number|null) and {matched} (the canonical text, if any).
 */
export function matchTextAnswer(question, submitted) {
  const norm = normalizeText(submitted);
  if (!norm) return { rank: null, matched: null, blank: true };
  for (const u of question.unlisted || []) {
    if (normalizeText(u) === norm) return { rank: null, matched: null };
  }
  // Exact / singular / typo-tolerant match against every stored text.
  for (const slot of question.textAnswers || []) {
    for (const t of slot.texts) {
      const nt = normalizeText(t);
      if (nt === norm) return { rank: slot.rank, matched: t };
      if (singular(nt) === singular(norm)) return { rank: slot.rank, matched: t };
      const dist = levenshtein(nt, norm);
      const tol = Math.max(1, Math.floor(Math.min(nt.length, norm.length) * 0.2));
      if (dist <= tol && Math.abs(nt.length - norm.length) <= 3) return { rank: slot.rank, matched: t };
    }
  }
  return { rank: null, matched: null };
}

// ---------- dates & deterministic picks ----------

/** Today's date in America/New_York as YYYY-MM-DD. */
export function etDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(dateStr, n) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd + n));
  return d.toISOString().slice(0, 10);
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic shuffle with a string seed — same input, same output, every server. */
export function seededShuffle(arr, seed) {
  const rnd = mulberry32(hashStr(seed));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Compose a 7-round set: guess, guess, text, split, split, text, finale.
 * Daily sets are seeded by date (stable + frozen); Endless uses a random seed.
 */
export function composeSet(bank, seed) {
  const guessPool = seededShuffle(bank.filter((q) => q.kind === "guess" && !q.finale), seed + ":g");
  const textPool = seededShuffle(bank.filter((q) => q.kind === "text"), seed + ":t");
  const splitPool = seededShuffle(bank.filter((q) => q.kind === "split"), seed + ":s");
  const finalePool = seededShuffle(bank.filter((q) => q.finale), seed + ":f");
  return [guessPool[0], guessPool[1], textPool[0], splitPool[0], splitPool[1], textPool[1], finalePool[0]].map((q) => q.id);
}

/**
 * Derive a Contribute vote prompt when none was harvested for the question.
 * Harvested prompts (from the live game's Contribute screen) always win;
 * these transforms cover the rest. They ask the underlying yes/no preference
 * the question is really about — never a percentage.
 */
export function deriveVotePrompt(q) {
  if (q.votePrompt) return q.votePrompt;
  if (q.kind === "split") return "Pick your side";
  const t = (q.text || "").replace(/\?$/, "").trim();
  const body = t.replace(/^What % of (?:people|adults|Americans|US adults|car owners|everyone alive today) /i, "");
  let m;
  if ((m = body.match(/^think they(?:'d| would) (?:be able to )?(.+)$/i))) return `Do you think you ${m[1]}?`;
  if ((m = body.match(/^think they(?:'re| are) (.+)$/i))) return `Do you think you're ${m[1]}?`;
  if ((m = body.match(/^think they could (.+)$/i))) return `Could you ${m[1]}?`;
  if ((m = body.match(/^believe they(?:'ve| have) (.+)$/i))) return `Have you ${m[1]}?`;
  if ((m = body.match(/^believe they could (.+)$/i))) return `Could you ${m[1]}?`;
  if ((m = body.match(/^would (.+)$/i))) return `Would you ${m[1]}?`;
  if ((m = body.match(/^have (.+)$/i))) return `Have you ${m[1]}?`;
  if ((m = body.match(/^are (.+)$/i))) return `Are you ${m[1]}?`;
  if ((m = body.match(/^prefer (.+)$/i))) return `Do you prefer ${m[1]}?`;
  if ((m = body.match(/^keep (.+)$/i))) return `Do you keep ${m[1]}?`;
  if ((m = body.match(/^say they(?:'d| would) (.+)$/i))) return `Would you ${m[1]}?`;
  if ((m = body.match(/^still (.+)$/i))) return `Do you still ${m[1]}?`;
  if ((m = body.match(/^eat (.+)$/i))) return `Do you eat ${m[1]}?`;
  if ((m = body.match(/^check (.+)$/i))) return `Do you check ${m[1]}?`;
  if ((m = body.match(/^set (.+)$/i))) return `Do you set ${m[1]}?`;
  if ((m = body.match(/^talk (.+)$/i))) return `Do you talk ${m[1]}?`;
  return "Is this you?";
}
