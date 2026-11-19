// Honeydle — pure game rules. No I/O. Everything here is unit-tested.

export const ROUND_KINDS = ["guess", "guess", "text", "guess", "guess", "text", "finale"];
export const ROUNDS = ROUND_KINDS.length;
export const ROUND_MAX = 175;
export const MAX_SCORE = ROUNDS * ROUND_MAX; // 1225
export const RUBY_THRESHOLD = 900;

// Difference tiers for Guess and Finale rounds. Names are player copy.
export const TIERS = [
  { maxDiff: 0, points: 175, name: "Bullseye", emoji: "🎯" },
  { maxDiff: 1, points: 100, name: "One Off", emoji: "✅" },
  { maxDiff: 3, points: 90, name: "Razor Close", emoji: "🔥" },
  { maxDiff: 6, points: 75, name: "Close", emoji: "🙂" },
  { maxDiff: 10, points: 55, name: "Warm", emoji: "😐" },
  { maxDiff: 15, points: 35, name: "Lukewarm", emoji: "😬" },
  { maxDiff: 25, points: 15, name: "Cold", emoji: "🥶" },
  { maxDiff: Infinity, points: 5, name: "Way Off", emoji: "❌" },
];
export const BLANK = { points: 0, name: "Blank", emoji: "⬜" };

// Text rounds: rank bands mapped onto the same named tiers.
const RANK_BANDS = [
  { maxRank: 1, tier: 0 },
  { maxRank: 3, tier: 1 },
  { maxRank: 6, tier: 2 },
  { maxRank: 10, tier: 3 },
  { maxRank: 15, tier: 4 },
  { maxRank: 20, tier: 5 },
  { maxRank: 30, tier: 6 },
  { maxRank: Infinity, tier: 7 },
];

export function tierForDiff(diff) {
  return TIERS.find((t) => diff <= t.maxDiff);
}

export function tierByName(name) {
  return TIERS.find((t) => t.name === name) || (name === BLANK.name ? BLANK : null);
}

/** Whole-percent and hundredth-percent values compare exactly via integers. */
const hundredths = (v) => Math.round(Number(v) * 100);

/**
 * Score a percentage answer. When the real answer is under 1%, the
 * difference is measured in hundredths of a percent on the same curve.
 */
export function scoreNumeric(answer, guess) {
  const a = hundredths(answer);
  const g = hundredths(guess);
  const diff = a < 100 ? Math.abs(a - g) : Math.abs(Math.round(a / 100) - Math.round(g / 100));
  const t = tierForDiff(diff);
  return { points: t.points, tier: t.name, diff };
}

/** Score a text round by rank. rank null = unlisted, blank = empty answer. */
export function scoreRank(rank, blank = false) {
  if (blank) return { points: BLANK.points, tier: BLANK.name, rank: null };
  if (rank == null) return { points: 5, tier: "Way Off", rank: null };
  const t = TIERS[RANK_BANDS.find((b) => rank <= b.maxRank).tier];
  return { points: t.points, tier: t.name, rank };
}

/**
 * Validate a percentage guess. Returns an error string or null.
 * 0–100; whole numbers at 1% and above; hundredths only below 1%.
 * Uses a float tolerance so 0.07 (7.000000000000001 hundredths) is valid.
 */
export function validateGuess(value) {
  if (value === null || value === undefined || value === "") return "Enter a number between 0 and 100.";
  const g = Number(value);
  if (!Number.isFinite(g) || g < 0 || g > 100) return "Enter a number between 0 and 100.";
  if (g >= 1 && Math.abs(g - Math.round(g)) > 1e-9) return "Whole numbers only at 1% and above.";
  if (g < 1 && Math.abs(g * 100 - Math.round(g * 100)) > 1e-9) return "Below 1%, use hundredths (like 0.25).";
  return null;
}

/** Canonical numeric form of a valid guess (strips float noise). */
export function cleanGuess(value) {
  const g = Number(value);
  return g >= 1 ? Math.round(g) : Math.round(g * 100) / 100;
}

// ---------- dates ----------

export const TIME_ZONE = "America/New_York";

/** Today's date in Eastern time as YYYY-MM-DD. */
export function easternDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

// ---------- deterministic composition ----------

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(arr, seed) {
  const rnd = mulberry32(hashStr(String(seed)));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function poolOf(q) {
  if (q.kind === "guess") return q.finale ? "finale" : "guess";
  return q.kind; // text
}

/**
 * Compose a 7-round set in the fixed order: guess, guess, text, guess,
 * guess, text, finale. Same seed + same bank → same ids, on any server.
 * Throws rather than ever returning a short or duplicated set.
 */
export function composeSet(bank, seed) {
  const pools = { guess: [], text: [], finale: [] };
  for (const q of bank) pools[poolOf(q)]?.push(q);
  const shuffled = {};
  for (const k of Object.keys(pools)) {
    shuffled[k] = seededShuffle(pools[k].sort((a, b) => a.id - b.id), `${seed}:${k}`);
  }
  const used = { guess: 0, text: 0, finale: 0 };
  const ids = ROUND_KINDS.map((kind) => {
    const q = shuffled[kind][used[kind]++];
    if (!q) throw new Error(`composeSet(${seed}): the ${kind} pool ran dry — bank too small for a full set`);
    return q.id;
  });
  if (!isValidSet(ids, bank)) throw new Error(`composeSet(${seed}) produced an invalid set ${JSON.stringify(ids)}`);
  return ids;
}

/** A healthy set: exactly 7 unique ids, all present in the bank, right kinds in order. */
export function isValidSet(ids, bank) {
  if (!Array.isArray(ids) || ids.length !== ROUNDS || new Set(ids).size !== ROUNDS) return false;
  const byId = new Map(bank.map((q) => [q.id, q]));
  return ids.every((id, i) => byId.has(id) && poolOf(byId.get(id)) === ROUND_KINDS[i]);
}

// ---------- the bee ----------

/** Trailing run of Bullseyes (175s) in a list of round results. */
export function bullseyeStreak(results) {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i]?.points === ROUND_MAX; i--) n++;
  return n;
}

/**
 * Which bee hosts a reveal. The diamond bee is the 2nd+ consecutive
 * Bullseye within the same play; ruby is results-only and never per-round.
 */
export function beeForRound(points, streak) {
  if (points === 175) return streak >= 2 ? "diamond" : "golden";
  if (points === 100) return "honey";
  if (points === 90) return "drop";
  if (points === 75 || points === 55) return "normal";
  return "thirsty";
}

export function isRuby(score, completed) {
  return Boolean(completed) && score >= RUBY_THRESHOLD;
}

// ---------- public shapes ----------

/** The only fields of a question that may ever reach a client before submit. */
export function publicQuestion(q) {
  const out = { id: q.id, kind: q.kind === "guess" && q.finale ? "finale" : q.kind, category: q.category, text: q.text, finale: Boolean(q.finale) };
  return out;
}

export function shareText(date, results, score) {
  const emojis = results.map((r) => (tierByName(r.tier) || BLANK).emoji).join("");
  return `Honeydle ${date}\n${emojis}\n${score}/${MAX_SCORE}`;
}

/** Format a percentage for display: hundredths below 1%, whole numbers above. */
export function formatPct(v) {
  const n = Number(v);
  return n < 1 ? n.toFixed(2) : String(Math.round(n));
}
