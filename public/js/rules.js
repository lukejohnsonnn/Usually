// Honeydle — pure game rules. No I/O. Everything here is unit-tested.

export const ROUND_KINDS = ["guess", "guess", "text", "guess", "guess", "text", "finale"];
export const ROUNDS = ROUND_KINDS.length;
// Round timers: quick for number guesses, a little longer to type a text answer.
export const GUESS_SECONDS = 15;
export const TEXT_SECONDS = 25;
export const secondsFor = (kind) => (kind === "text" ? TEXT_SECONDS : GUESS_SECONDS);
export const ROUND_MAX = 175;
// The first day in Past games; #1 is this day. Nov 14–18 are hand-picked launch
// games from the original bank, Nov 19 was the first live Daily.
export const FIRST_DAILY = "2026-11-14";
export const MAX_SCORE = ROUNDS * ROUND_MAX; // 1225 — never shown to players
export const JAR_FULL = 1000; // the honey jar reads full at this score
export const RUBY_THRESHOLD = 800; // a finished run scoring this or more unlocks the hidden ruby bee

// Difference tiers for Guess and Finale rounds. Names are player copy.
// The curve rewards a good estimate: within 6 points keeps well over half
// the round, and a decent run of 7 lands around 650–800 out of 1225.
// Six tiers on one temperature scale, from dead on to way off. The points
// curve underneath (STEPS) is unchanged: Hot and Warm each cover two steps.
export const TIERS = [
  { maxDiff: 0, points: 175, minPoints: 175, name: "Divine", emoji: "💎", bee: "diamond" },
  { maxDiff: 3, points: 150, minPoints: 135, name: "Golden Nectar", emoji: "✨", bee: "golden" },
  { maxDiff: 12, points: 115, minPoints: 95, name: "Sweet!", emoji: "😋", bee: "honey" },
  { maxDiff: 25, points: 70, minPoints: 70, name: "Bland", emoji: "😐", bee: "lukewarm" },
  { maxDiff: 40, points: 40, minPoints: 40, name: "Bitter", emoji: "😖", bee: "bitter" },
  { maxDiff: Infinity, points: 10, minPoints: 0, name: "Yucky", emoji: "🤢", bee: "yucky" },
];
// The scoring curve: [max difference, max rank, points]. Never changes.
const STEPS = [
  [0, 1, 175], [1, 3, 150], [3, 6, 135], [6, 10, 115], [12, 15, 95], [25, 20, 70], [40, 30, 40], [Infinity, Infinity, 10],
];
/** The tier a points value belongs to (135 is Golden Nectar, 95 is Sweet!). */
export const tierForPoints = (points) => TIERS.find((t) => points >= t.minPoints) || TIERS.at(-1);
// Names used before the six-tier scale, so older saved results still show the right bee and emoji.
const LEGACY_TIERS = {
  Bullseye: "Divine", "One Off": "Golden Nectar", "Razor Close": "Golden Nectar", Hot: "Golden Nectar",
  Close: "Sweet!", Warm: "Sweet!", Lukewarm: "Bland", Cold: "Bitter", "Way Off": "Yucky",
};
export const BLANK = { points: 0, name: "Blank", emoji: "⬜" };

export function tierForDiff(diff) {
  return TIERS.find((t) => diff <= t.maxDiff);
}

export function tierByName(name) {
  const n = LEGACY_TIERS[name] || name;
  return TIERS.find((t) => t.name === n) || (name === BLANK.name ? BLANK : null);
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
  const points = STEPS.find((s) => diff <= s[0])[2];
  return { points, tier: tierForPoints(points).name, diff };
}

/** Score a text round by rank. rank null = unlisted, blank = empty answer. */
export function scoreRank(rank, blank = false) {
  if (blank) return { points: BLANK.points, tier: BLANK.name, rank: null };
  if (rank == null) return { points: TIERS.at(-1).points, tier: TIERS.at(-1).name, rank: null };
  const points = STEPS.find((s) => rank <= s[1])[2];
  return { points, tier: tierForPoints(points).name, rank };
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

/** Honeydle day number: #1 is FIRST_DAILY. */
export function dayNumber(date) {
  const [a, b] = [date, FIRST_DAILY].map((d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); });
  return Math.round((a - b) / 86_400_000) + 1;
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
 * Which bee hosts a reveal: one bee per tier, Divine is diamond. On the
 * last round, if that answer takes the finished run to 800 or more, the ruby bee
 * hosts instead. Pass finalScore only for the round that completes a play.
 */
export function beeForRound(points, { finalScore = null } = {}) {
  if (finalScore != null && isRuby(finalScore, true)) return "ruby";
  return points > 0 ? tierForPoints(points).bee : "yucky";
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
