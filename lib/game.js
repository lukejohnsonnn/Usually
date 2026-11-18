// Pure game logic for Usually — no I/O, no DB. Fully unit-testable.
// Scoring, fuzzy text matching, deterministic daily composition, ET dates.

export const TIERS = [
  { maxDiff: 0, points: 175, name: "Bullseye" },
  { maxDiff: 1, points: 100, name: "One Off" },
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
  // Hundredths only below 1% — with a float epsilon, not an exact compare:
  // 0.07 * 100 is 7.000000000000001 in binary floating point, so the exact
  // check rejected the correct answer to Q79 (0.07%) outright. 1e-9 still
  // rejects real non-hundredths (0.071 is 0.1 away from a whole hundredth).
  if (g < 1 && Math.abs(g * 100 - Math.round(g * 100)) > 1e-9) return "Below 1%, use hundredths (e.g. 0.25).";
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
  if (NO_S_STRIP.has(w)) return w;
  const ie = IE_SINGULARS[w];
  if (ie) return ie;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes") || w.endsWith("ches") || w.endsWith("shes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// Words that end in "s" but are not plurals — stripping it would mangle them
// ("gas" -> "ga", "bus" -> "bu", "las" in "Las Vegas" -> "la"). Plurals of
// initials (CDs, LPs, PJs) still strip, so they are deliberately NOT here.
const NO_S_STRIP = new Set(["gas", "bus", "gps", "las", "los", "vis", "us", "as", "yes"]);

// Plurals whose singular ends in "-ie", not "-y" ("cookies" is "cookie", not
// "cooky"). Everything else ending in "-ies" takes the -y rule above.
const IE_SINGULARS = {
  cookies: "cookie", veggies: "veggie", brownies: "brownie", smoothies: "smoothie",
  zombies: "zombie", movies: "movie", selfies: "selfie", hoagies: "hoagie",
  scrunchies: "scrunchie", ciggies: "ciggie", yorkies: "yorkie", aussies: "aussie",
  collies: "collie", sharpies: "sharpie", krispies: "krispie", smokies: "smokie",
  chilies: "chili",
};

// Words that are never the -ing form of a verb (would stem wrong).
const NO_ING_STRIP = new Set(["morning", "evening", "something", "anything", "everything", "nothing", "during", "ceiling", "darling", "spring", "string", "bedding",
  // nouns that merely end in "ing": pudding (food), keyring, gullwing (car
  // doors), sibling, duckling, beijing, thanksgiving, lightning, handwriting,
  // clothing. Stemming them ("pudding" -> "pud", "keyring" -> "keyr") is wrong.
  "pudding", "keyring", "gullwing", "sibling", "duckling", "beijing", "thanksgiving", "lightning", "handwriting", "clothing"]);

// Words ending in "ly" that are not adjective + ly — the -ly rule would
// mangle them ("apply" -> "app", "butterfly" -> "butterf", "belly" -> "bell",
// "italy" -> "ital"). Adverbs ("freshly", "quickly") and true adjective+ly
// forms ("monthly" -> "month", "lovely" -> "love") still strip.
const NO_LY_STRIP = new Set(["apply", "reply", "supply", "comply", "imply", "rely",
  "ally", "rally", "tally", "dally", "bully", "sully", "gully", "belly", "jelly",
  "silly", "hilly", "chilly", "frilly", "smelly", "butterfly", "dragonfly",
  "firefly", "horsefly", "housefly", "fruitfly", "sandfly", "gadfly", "mayfly",
  "stonefly", "jolly", "woolly", "ghastly", "assembly", "brolly", "grizzly",
  "italy", "kelly", "philly", "only", "early", "family", "daily"]);

// Adverbs whose adjective drops its final e before "ly" ("truly" is true,
// not "tru"); the -ly rule cannot derive these.
const LY_ROOTS = { truly: "true", duly: "due", wholly: "whole" };

const IRREGULAR_STEMS = {
  children: "child", people: "person", men: "man", women: "woman",
  feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
};

// Verbs whose -ing/-ed spelling doubles the final l (British doubling of a
// single-l stem: travel -> travelling, cancel -> cancelled). Every other -ll
// stem keeps its double l: fall, call, sell, tell, spell, grill, roll, and
// compounds built on them (resell, retell, misspell) — the old rule deduped
// "ll" blindly, so "falling" stemmed to "fal" while "fall" stayed "fall".
const LL_DOUBLE = new Set(["travel", "cancel", "model", "label", "level", "total", "quarrel", "fuel",
  "shovel", "snivel", "grovel", "drivel", "towel", "trowel", "chisel", "novel", "marvel",
  "funnel", "tunnel", "channel", "panel", "signal", "duel", "cruel", "jewel",
  "expel", "impel", "repel", "compel", "propel", "rebel", "dispel", "revel", "dishevel",
  "devil", "ravel", "gravel", "gavel", "bevel", "control", "patrol"]);

// Undo one doubled consonant after removing -ing/-ed, but only when the
// doubling came from the suffix. Stems that double their final consonant
// (stop/stopping, run/running, swim/swimming) lose one letter; stems that
// already end in a double consonant (miss, fall, call, grill, dress, stuff)
// keep it. The old rule deduped ss/ll blindly, so "missing" stemmed to "mis"
// and "falling" to "fal" while "miss"/"fall" stayed whole — the base form
// could never match the -ing form.
function dedupeDoubled(base) {
  if (base.length < 2) return base;
  const last = base[base.length - 1];
  if (last !== base[base.length - 2]) return base;
  if ("bdgmnprt".includes(last)) return base.slice(0, -1);
  if (last === "l" && LL_DOUBLE.has(base.slice(0, -1))) return base.slice(0, -1);
  return base;
}

// Restore the silent e of -le verbs after stripping -ing/-ed: "trembling"
// is tremble, not "trembl"; "handling" is handle, not "handl". Only fires
// when the base ends in a consonant + single l — words ending in -rl/-wl
// (curl, bowl, howl, growl) and -ll (fall, call) are not -le verbs.
function restoreLe(base) {
  if (/[bcdfghjkmnpqstvyxz]l$/.test(base)) return base + "e";
  return base;
}

// Every known inflection of a verb maps to one root, so "live forever",
// "living forever" and "lived forever" all match, and "fly", "flying" and
// "flight" are the same answer. Consulted before the generic stemmer. It
// covers irregular pasts (flew, took, bought), e-drop -ing/-ed forms the
// stemmer cannot derive by rule (living -> live, not "liv"; baked -> bake,
// not "bak"), and noun forms (flight -> fly, meditation -> meditate).
// Deliberately NOT mapped: forms that are also a distinct answer elsewhere
// in the bank — rose (tattoo, Q119/Q125) is not rise, dove (pet/tattoo,
// Q119/Q177) is not dive, lead (dog's lead, Q112) is not led, ground
// (beef/coffee) is not grind, burnt (orange, Q180) stays burnt, tired
// (a state) is not tire (a car part, Q106/Q116). Identity entries block
// the generic stemmer from mangling a word (airbed, samoyed, sundried).
const VERB_ROOTS = {
  // irregular pasts / participles
  flew: "fly", flown: "fly", swam: "swim", swum: "swim", ran: "run",
  drove: "drive", driven: "drive", sang: "sing", sung: "sing", drew: "draw",
  drawn: "draw", wrote: "write", written: "write", slept: "sleep",
  ate: "eat", eaten: "eat", drank: "drink", drunk: "drink", rode: "ride",
  ridden: "ride", built: "build", took: "take", taken: "take", made: "make",
  got: "get", gave: "give", given: "give", came: "come", went: "go",
  gone: "go", seen: "see", did: "do", done: "do", had: "have",
  left: "leave", kept: "keep", brought: "bring", bought: "buy",
  thought: "think", taught: "teach", caught: "catch", found: "find",
  won: "win", spoke: "speak", spoken: "speak", broke: "break",
  broken: "break", chose: "choose", chosen: "choose", stole: "steal",
  stolen: "steal", woke: "wake", woken: "wake", wore: "wear", worn: "wear",
  fed: "feed", felt: "feel", met: "meet", sent: "send", spent: "spend",
  sold: "sell", told: "tell", became: "become", began: "begin",
  begun: "begin", grew: "grow", grown: "grow", threw: "throw",
  thrown: "throw", knew: "know", known: "know", forgot: "forget",
  forgotten: "forget", overslept: "oversleep", fell: "fall", fallen: "fall",
  hid: "hide", hidden: "hide", sought: "seek", lay: "lie", lain: "lie",
  bit: "bite", bitten: "bite", rang: "ring", rung: "ring", shook: "shake",
  shaken: "shake", spun: "spin", slid: "slide", swung: "swing",
  sank: "sink", sunk: "sink", leapt: "leap", dreamt: "dream",
  learnt: "learn", burnt: "burn", smelt: "smell", spelt: "spell",
  spoilt: "spoil", spilt: "spill", understood: "understand", held: "hold",
  meant: "mean", dealt: "deal", lent: "lend", bent: "bend", froze: "freeze",
  frozen: "freeze", swore: "swear", sworn: "swear", stuck: "stick",
  struck: "strike", stung: "sting", stank: "stink", stunk: "stink",
  shrank: "shrink", shrunk: "shrink", swollen: "swell", tore: "tear",
  torn: "tear", blew: "blow", blown: "blow", dug: "dig", hung: "hang",
  shone: "shine", dived: "dive", said: "say", sat: "sit", stood: "stand",
  shown: "show", lost: "lose", paid: "pay", shot: "shoot",
  // auxiliaries / forms of be, have, do, go, see
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be",
  being: "be", has: "have", does: "do", saw: "see",
  // -ing forms of silent-e verbs (strip "ing" alone gives the wrong stem)
  living: "live", dying: "die", lying: "lie", tying: "tie", vying: "vie",
  going: "go", doing: "do", seeing: "see", having: "have", making: "make",
  taking: "take", giving: "give", coming: "come", moving: "move",
  loving: "love", using: "use", dancing: "dance", writing: "write",
  driving: "drive", riding: "ride", hiding: "hide", smiling: "smile",
  staring: "stare", dining: "dine", baking: "bake", smoking: "smoke",
  slicing: "slice", shaving: "shave", changing: "change", arguing: "argue",
  practicing: "practice", practising: "practice", rehearsing: "rehearse",
  memorizing: "memorize", memorising: "memorize", exercising: "exercise",
  meditating: "meditate", freezing: "freeze", choosing: "choose",
  losing: "lose", closing: "close", raising: "raise", phasing: "phase",
  serving: "serve", snoring: "snore", cloning: "clone", creating: "create",
  raking: "rake", typing: "type", boring: "bore", saving: "save",
  leaving: "leave", choking: "choke", wiping: "wipe", skating: "skate",
  nursing: "nurse", shaking: "shake", whining: "whine", chiming: "chime",
  vibrating: "vibrate", sneezing: "sneeze", bathing: "bathe",
  measuring: "measure", judging: "judge", puking: "puke", pausing: "pause",
  duplicating: "duplicate", communicating: "communicate",
  convincing: "convince", conjuring: "conjure", surviving: "survive",
  erasing: "erase", sensing: "sense", filing: "file", shelving: "shelve",
  guiding: "guide", landscaping: "landscape", barbecuing: "barbecue",
  refereeing: "referee", schmoozing: "schmooze", breathing: "breathe",
  waking: "wake", eying: "eye", flaming: "flame", sharing: "share",
  caring: "care", daring: "dare", scaring: "scare", preparing: "prepare",
  comparing: "compare", declaring: "declare", ignoring: "ignore",
  exploring: "explore", storing: "store", scoring: "score", adoring: "adore",
  enduring: "endure", assuring: "assure", treasuring: "treasure",
  figuring: "figure", injuring: "injure", picturing: "picture",
  capturing: "capture", manufacturing: "manufacture", featuring: "feature",
  nurturing: "nurture", torturing: "torture", gesturing: "gesture",
  venturing: "venture", faking: "fake", liking: "like", striking: "strike",
  paring: "pare", baring: "bare", diving: "dive", rising: "rise",
  risen: "rise", telling: "tell", selling: "sell", becoming: "become",
  biting: "bite", cursing: "curse", sliding: "slide", aging: "age",
  debating: "debate", gaming: "game", manipulating: "manipulate",
  piping: "pipe", scraping: "scrape", vaping: "vape", charging: "charge",
  hoping: "hope", hiking: "hike", icing: "ice",
  // -ed forms of silent-e verbs (strip "ed" alone gives the wrong stem)
  baked: "bake", changed: "change", sliced: "slice", smoked: "smoke",
  shaved: "shave", crumbled: "crumble", marinated: "marinate",
  stared: "stare", lived: "live", danced: "dance", moved: "move",
  loved: "love", used: "use", smiled: "smile", dined: "dine",
  exercised: "exercise", meditated: "meditate", misplaced: "misplace",
  chased: "chase", suffocated: "suffocate", bottled: "bottle",
  fired: "fire", enclosed: "enclose", expired: "expire", silenced: "silence",
  based: "base", guided: "guide", complicated: "complicate", dozed: "doze",
  urinated: "urinate", glazed: "glaze", pickled: "pickle", minced: "mince",
  caramelized: "caramelize", caramelised: "caramelise", devilled: "devil",
  served: "serve", snored: "snore", cloned: "clone", created: "create",
  raked: "rake", typed: "type", bored: "bore", saved: "save",
  choked: "choke", wiped: "wipe", skated: "skate", nursed: "nurse",
  whined: "whine", chimed: "chime", vibrated: "vibrate", sneezed: "sneeze",
  bathed: "bathe", measured: "measure", puked: "puke", paused: "pause",
  duplicated: "duplicate", communicated: "communicate",
  convinced: "convince", conjured: "conjure", survived: "survive",
  erased: "erase", sensed: "sense", filed: "file", shelved: "shelve",
  landscaped: "landscape", barbecued: "barbecue", refereed: "referee",
  schmoozed: "schmooze", breathed: "breathe", flamed: "flame",
  shared: "share", cared: "care", dared: "dare", scared: "scare",
  prepared: "prepare", compared: "compare", declared: "declare",
  ignored: "ignore", explored: "explore", stored: "store", scored: "score",
  adored: "adore", endured: "endure", assured: "assure",
  treasured: "treasure", figured: "figure", injured: "injure",
  pictured: "picture", captured: "capture", manufactured: "manufacture",
  featured: "feature", nurtured: "nurture", tortured: "torture",
  gestured: "gesture", ventured: "venture", faked: "fake", liked: "like",
  pared: "pare", bared: "bare", raised: "raise", phased: "phase",
  closed: "close", tasted: "taste", wasted: "waste", pasted: "paste",
  hasted: "haste", agreed: "agree", freed: "free", succeeded: "succeed",
  proceeded: "proceed", exceeded: "exceed", bled: "bleed", bred: "breed",
  practiced: "practice", practised: "practice", rehearsed: "rehearse",
  cursed: "curse", argued: "argue", memorized: "memorize",
  memorised: "memorize", charged: "charge", hoped: "hope", hiked: "hike",
  debated: "debate", gamed: "game", manipulated: "manipulate",
  piped: "pipe", scraped: "scrape", vaped: "vape", iced: "ice",
  // -ing/-ed where the stem itself ends in a doubled consonant
  adding: "add", added: "add", egging: "egg", egged: "egg", gassing: "gas",
  gassed: "gas", bussing: "bus", bussed: "bus", ebbing: "ebb", ebbed: "ebb",
  purring: "purr", purred: "purr", erring: "err", erred: "err",
  // noun forms of verbs
  flight: "fly", meditation: "meditate",
  // -ied forms the generic -ied -> -y rule would mangle, and -ed pasts the
  // "eed" guard would block
  died: "die", lied: "lie", tied: "tie", skied: "ski", taxied: "taxi",
  judged: "judge", waked: "wake", owed: "owe", owing: "owe",
  // identity entries: keep the word whole, do not stem it
  airbed: "airbed", samoyed: "samoyed", sundried: "sundried",
};

// Light stemmer. Conservative on purpose: it must never merge two different
// words ("keys" -> "key" but "keychain" stays "keychain"). Typos are the
// fuzzy layer's job, not the stemmer's. Verb-form unification lives in
// VERB_ROOTS above (checked first); the rules below only handle regular
// -ing/-ed/-ly/plural stripping.
function stem(w) {
  const irr = IRREGULAR_STEMS[w];
  if (irr) return irr;
  const verb = VERB_ROOTS[w];
  if (verb) return verb;
  const ly = LY_ROOTS[w];
  if (ly) return ly;
  if (w.endsWith("ing") && w.length > 5 && !NO_ING_STRIP.has(w)) {
    let base = dedupeDoubled(w.slice(0, -3));
    base = restoreLe(base);
    return base;
  }
  if (w.endsWith("ed") && w.length > 4 && !w.endsWith("eed")) {
    if (w.endsWith("ied")) return w.slice(0, -3) + "y";
    let base = dedupeDoubled(w.slice(0, -2));
    base = restoreLe(base);
    return base;
  }
  if (w.endsWith("ly") && w.length > 4 && !NO_LY_STRIP.has(w)) {
    const base = w.slice(0, -2);
    // Block only when the base ends in i/o/u ("family" -> "fami", "holy" ->
    // "ho"): those are not adjective + ly. Bases ending in e DO strip
    // ("purely" -> "pure", "sincerely" -> "sincere", "lovely" -> "love").
    if (!/[iou]$/.test(base)) return base; // "freshly" -> "fresh", but "family" stays
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
  ["wash machine", "washer"],
  ["washed machine", "washer"],
  ["tennis shoes", "sneakers"],
  ["driver's license", "license"],
  ["drivers license", "license"],
  ["usb stick", "usb drive"],
  ["flash drive", "usb drive"],
  ["tv set", "tv"],
  ["id card", "id"],
  ["key ring", "keyring"],
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

