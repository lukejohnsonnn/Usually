// Honeydle — pure game rules. No I/O. Everything here is unit-tested.

export const ROUND_KINDS = ["guess", "guess", "text", "guess", "guess", "text", "finale"];
export const ROUNDS = ROUND_KINDS.length;
// Round timers: quick for number guesses, a little longer to type a text answer.
export const GUESS_SECONDS = 15;
export const TEXT_SECONDS = 25;
export const secondsFor = (kind) => (kind === "text" ? TEXT_SECONDS : GUESS_SECONDS);
export const ROUND_MAX = 175;
export const MAX_SCORE = ROUNDS * ROUND_MAX; // 1225 — never shown to players
export const JAR_FULL = 1000; // the honey jar reads full at this score
export const RUBY_THRESHOLD = 800; // a finished run scoring this or more unlocks the hidden ruby bee

// Difference tiers for Guess and Finale rounds. Names are player copy.
// The curve rewards a good estimate: within 6 points keeps well over half
// the round, and a decent run of 7 lands around 650–800 out of 1225.
export const TIERS = [
  { maxDiff: 0, points: 175, name: "Bullseye", emoji: "🎯", bee: "diamond" },
  { maxDiff: 1, points: 150, name: "One Off", emoji: "✅", bee: "golden" },
  { maxDiff: 3, points: 135, name: "Razor Close", emoji: "🔥", bee: "honey" },
  { maxDiff: 6, points: 115, name: "Close", emoji: "🙂", bee: "drop" },
  { maxDiff: 12, points: 95, name: "Warm", emoji: "😐", bee: "normal" },
  { maxDiff: 25, points: 70, name: "Lukewarm", emoji: "😬", bee: "thirsty" },
  { maxDiff: 40, points: 40, name: "Cold", emoji: "🥶", bee: "thirsty" },
  { maxDiff: Infinity, points: 10, name: "Way Off", emoji: "❌", bee: "thirsty" },
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
  if (rank == null) return { points: TIERS.at(-1).points, tier: TIERS.at(-1).name, rank: null };
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
  // retired questions stay in the bank (days that used them keep working) but are never picked again
  for (const q of bank) if (!q.retired) pools[poolOf(q)]?.push(q);
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

/**
 * Which bee hosts a reveal: one bee per tier, Bullseye is diamond. On the
 * last round, if that answer takes the finished run to 800 or more, the ruby bee
 * hosts instead. Pass finalScore only for the round that completes a play.
 */
export function beeForRound(points, { finalScore = null } = {}) {
  if (finalScore != null && isRuby(finalScore, true)) return "ruby";
  return TIERS.find((t) => t.points === points)?.bee || "thirsty";
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
  return `Honeydle ${date}\n${emojis}\n🍯 ${score}`;
}

/** Format a percentage for display: hundredths below 1%, whole numbers above. */
export function formatPct(v) {
  const n = Number(v);
  return n < 1 ? n.toFixed(2) : String(Math.round(n));
}
