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

// Autocorrect-style matching: canonicalize both the submission and every
// stored variant (aliases, filler words, stemming, word order), then score.
// Exact canonical matches win; near-misses (typos, synonyms, rephrasings)
// match only when they are clearly closer to one rank than to any other, so
// distinct answers in the same list are never conflated ("keys" is not
// "keychain", "dog" is not "hot dog", "phone" is not "phone screen").

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

// Words that are never the -ing form of a verb (would stem wrong).
const NO_ING_STRIP = new Set(["morning", "evening", "something", "anything", "everything", "nothing", "during", "ceiling", "darling", "spring", "string", "bedding"]);

const IRREGULAR_STEMS = {
  children: "child", people: "person", men: "man", women: "woman",
  feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
};

// Light stemmer. Conservative on purpose: it must never merge two different
// words ("keys" -> "key" but "keychain" stays "keychain"). Typos are the
// fuzzy layer's job, not the stemmer's.
function stem(w) {
  const irr = IRREGULAR_STEMS[w];
  if (irr) return irr;
  if (w.endsWith("ing") && w.length > 5 && !NO_ING_STRIP.has(w)) {
    let base = w.slice(0, -3);
    if (base.length > 1 && base[base.length - 1] === base[base.length - 2]) base = base.slice(0, -1);
    return base;
  }
  if (w.endsWith("ed") && w.length > 4) {
    const base = w.slice(0, -2);
    if (base.length > 1 && base[base.length - 1] === base[base.length - 2]) return base.slice(0, -1);
    return w; // no e-restoration guessing ("baked" vs "bake" is a typo-layer job)
  }
  if (w.endsWith("ly") && w.length > 4) {
    const base = w.slice(0, -2);
    if (!/[aeiou]$/.test(base)) return base; // "freshly" -> "fresh", but "family" stays
  }
  return singular(w);
}

// Phrases and words that mean the same generic thing in these lists.
// Deliberately small: anything that could be a distinct answer somewhere
// (bike vs motorcycle, headphones vs earbuds) is NOT aliased here — those
// distinctions live in the bank's per-answer variants instead.
const PHRASE_ALIASES = [
  ["cell phone", "phone"],
  ["mobile phone", "phone"],
  ["remote control", "remote"],
  ["air conditioning", "ac"],
  ["air conditioner", "ac"],
  ["laptop computer", "laptop"],
  ["washing machine", "washer"],
  ["tennis shoes", "sneakers"],
  ["driver's license", "license"],
  ["drivers license", "license"],
  ["usb stick", "usb drive"],
  ["flash drive", "usb drive"],
  ["tv set", "tv"],
  ["id card", "id"],
];

const WORD_ALIASES = {
  cellphone: "phone", smartphone: "phone", mobile: "phone",
  television: "tv", telly: "tv",
  refrigerator: "fridge",
  sofa: "couch",
  money: "cash",
  trainers: "sneakers",
  shades: "sunglasses",
  automobile: "car",
  bicycle: "bike",
};

// Words that carry no meaning for matching ("my phone" is "phone").
const FILLER = new Set(["my", "your", "his", "her", "its", "our", "their", "of", "to", "in", "on", "at", "for", "with", "from", "by", "and", "or", "some"]);

/** Canonical token set for a string: sorted, deduped, stemmed tokens. */
export function canonicalTokens(s) {
  let n = normalizeText(s);
  for (const [phrase, repl] of PHRASE_ALIASES) n = n.split(phrase).join(repl);
  const tokens = n.split(" ").filter(Boolean)
    .map((w) => WORD_ALIASES[w] || w)
    .filter((w) => !FILLER.has(w))
    .map(stem)
    .filter(Boolean);
  return [...new Set(tokens)].sort();
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

// Damerau-Levenshtein (adjacent transposition counts as 1): the classic
// autocorrect case ("chram" -> "charm") is one transposition, not two edits.
function damerau(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// Typo tolerance per token: short words must match exactly, longer words
// forgive 1–2 edits. This is what keeps "cat" from matching "car".
function tokenTol(len) {
  return len <= 3 ? 0 : len <= 6 ? 1 : 2;
}

// Score the token-level fuzzy match between two same-length token sets.
// Returns null when any token is too far from every token on the other side.
function tokenFuzzyScore(sub, varT) {
  let distSum = 0, tolSum = 0;
  for (const t of sub) {
    let best = Infinity;
    for (const v of varT) best = Math.min(best, damerau(t, v));
    const tol = tokenTol(t.length);
    if (best > tol) return null;
    distSum += best; tolSum += Math.max(tol, 1);
  }
  for (const v of varT) {
    let best = Infinity;
    for (const t of sub) best = Math.min(best, damerau(v, t));
    if (best > tokenTol(v.length)) return null;
  }
  const closeness = 1 - distSum / Math.max(tolSum, 1);
  return 0.85 + 0.05 * closeness;
}

/**
 * Find the rank of a submitted answer in a text question's bank.
 * textAnswers: [{rank, texts:[]}], unlisted: [strings known NOT to be listed].
 * Returns {rank} (number|null) and {matched} (the canonical text, if any).
 * Scoring: exact canonical match 1.00, token-fuzzy 0.85–0.90, whole-string
 * typo 0.80. A rank wins only at >= 0.80 AND beating the next-best rank by
 * >= 0.10 — a near-tie means the answer is genuinely ambiguous, so it
 * scores as unlisted rather than guessing wrong.
 */
export function matchTextAnswer(question, submitted) {
  const norm = normalizeText(submitted);
  if (!norm) return { rank: null, matched: null, blank: true };
  for (const u of question.unlisted || []) {
    if (normalizeText(u) === norm) return { rank: null, matched: null };
  }
  const subTokens = canonicalTokens(submitted);
  const subKey = subTokens.join(" ");
  // Pass 1: exact canonical lookup (covers exact, case, plural, synonym,
  // word-order and filler-word differences in one shot).
  const exact = new Map();
  const variants = [];
  for (const slot of question.textAnswers || []) {
    for (const t of slot.texts) {
      const key = canonicalTokens(t).join(" ");
      if (!exact.has(key)) exact.set(key, []);
      exact.get(key).push({ rank: slot.rank, matched: t });
      variants.push({ rank: slot.rank, matched: t, key, tokens: key.split(" ").filter(Boolean) });
    }
  }
  if (exact.has(subKey)) {
    const hits = exact.get(subKey);
    const ranks = [...new Set(hits.map((h) => h.rank))];
    if (ranks.length === 1) return { rank: ranks[0], matched: hits[0].matched };
    return { rank: null, matched: null }; // same answer stored under 2 ranks: bank bug, don't guess
  }
  // Pass 2: fuzzy scan — best score per rank, then require a clear margin.
  const bestByRank = new Map();
  for (const v of variants) {
    let score = null;
    if (v.tokens.length === subTokens.length && subTokens.length > 0) {
      score = tokenFuzzyScore(subTokens, v.tokens);
    }
    if (score == null) {
      const nt = normalizeText(v.matched);
      const dist = levenshtein(nt, norm);
      const tol = Math.max(1, Math.floor(Math.min(nt.length, norm.length) * 0.2));
      if (dist <= tol && Math.abs(nt.length - norm.length) <= 3) score = 0.8;
    }
    if (score != null) {
      const cur = bestByRank.get(v.rank);
      if (!cur || score > cur.score) bestByRank.set(v.rank, { score, matched: v.matched });
    }
  }
  const ranked = [...bestByRank.entries()].sort((a, b) => b[1].score - a[1].score);
  if (ranked.length === 0) return { rank: null, matched: null };
  const [topRank, top] = ranked[0];
  if (top.score < 0.8) return { rank: null, matched: null };
  const second = ranked[1]?.[1].score ?? 0;
  if (top.score - second < 0.1) return { rank: null, matched: null };
  return { rank: topRank, matched: top.matched };
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
