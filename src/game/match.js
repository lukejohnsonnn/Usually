// Honeydle — text-answer matcher.
//
// Ported unchanged in behaviour from the v1 build (tag honeydle-v1), where it
// was tuned against real player answers. Autocorrect, never mind-reading:
// it fixes how an answer was typed, not what the player meant, and on any
// tie it declines rather than guessing.
//
// Autocorrect-style matching: canonicalize both the submission and every
// stored variant (aliases, filler words, stemming, word order), then score.
// Exact canonical matches win; near-misses (typos, synonyms, rephrasings)
// match only when they are clearly closer to one rank than to any other, so
// distinct answers in the same list are never conflated ("keys" is not
// "keychain", "dog" is not "hot dog", "phone" is not "phone screen").

export function normalizeText(s) {
  const base = String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeNumbers(base);
}

// Numbers are written many ways: "World War II", "world war 2", "world war
// two", "WW2", "WWII". Bring them all to digits so they compare equal, and
// so "World War I" and "World War II" stay different answers.
const NUMBER_WORDS = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20",
};
// "i" and "x" are only numerals at the end of a name ("Louis XIV", "World War I").
const ROMAN = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", xi: "11", xii: "12", xiii: "13", xiv: "14", xv: "15", xvi: "16" };
const ROMAN_TAIL_ONLY = { i: "1", x: "10", v: "5" };

function normalizeNumbers(n) {
  if (!n) return n;
  let words = n.split(" ");
  // ww1 / wwi / ww2 / wwii / worldwar 2 → world war N
  words = words.flatMap((w) => {
    const m = w.match(/^ww(1|2|i|ii)$/);
    if (m) return ["world", "war", m[1] === "i" ? "1" : m[1] === "ii" ? "2" : m[1]];
    const glued = w.match(/^worldwar(1|2|i|ii)?$/);
    if (glued) return ["world", "war", ...(glued[1] ? [glued[1] === "i" ? "1" : glued[1] === "ii" ? "2" : glued[1]] : [])];
    return [w];
  });
  return words.map((w, i) => {
    if (NUMBER_WORDS[w]) return NUMBER_WORDS[w];
    if (ROMAN[w] && w !== "v") return ROMAN[w];
    const last = i === words.length - 1 && words.length >= 2;
    if (last && ROMAN_TAIL_ONLY[w]) return ROMAN_TAIL_ONLY[w];
    return w;
  }).join(" ");
}

/** Digit groups in a normalized string — two answers with different numbers are never typos of each other. */
const digitsOf = (s) => (s.match(/\d+/g) || []).join(",");

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

// First word of a label, canonicalized like match tokens (normalize ->
// phrase aliases -> drop fillers -> word alias -> stem), preserving word
// order. Used by the distinctive-part pass: the distinctive part of an
// answer is (almost) always its leading word.
function firstToken(s) {
  let n = normalizeText(s);
  for (const [phrase, repl] of PHRASE_ALIASES) n = n.split(phrase).join(repl);
  const words = n.split(" ").filter(Boolean).filter((w) => !FILLER.has(w));
  if (!words.length) return null;
  return stem(WORD_ALIASES[words[0]] || words[0]);
}

// One input token against one label token: exact, or a typo with the same
// first letter. A 4-letter word one edit from a different word ("dove" vs
// "move") is a different word, not a typo — so fuzzy matches need the same
// first letter and >= 4 chars; short tokens are exact-only.
function tokenMatches(tok, v) {
  if (tok === v) return true;
  return tok.length >= 4 && tok[0] === v[0] && damerau(tok, v) <= tokenTol(tok.length);
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
 * scores as unlisted rather than guessing wrong. Pass 3 (distinctive-part
 * autocorrect) runs only after those fail: the input must be a recognizable
 * part of exactly one rank's label, or it stays unlisted. Pass-3 matches
 * carry autocorrected: true and matched is the rank's primary label.
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
    if (ranks.length === 1) return { rank: ranks[0], matched: hits[0].matched, exact: true };
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
      // never across different numbers ("ww2" is not "wwi"), never on tiny strings
      if (dist <= tol && Math.abs(nt.length - norm.length) <= 3 && digitsOf(nt) === digitsOf(norm) && Math.min(nt.length, norm.length) >= 4) score = 0.8;
    }
    if (score != null) {
      const cur = bestByRank.get(v.rank);
      if (!cur || score > cur.score) bestByRank.set(v.rank, { score, matched: v.matched });
    }
  }
  const ranked = [...bestByRank.entries()].sort((a, b) => b[1].score - a[1].score);
  if (ranked.length > 0) {
    const [topRank, top] = ranked[0];
    const second = ranked[1]?.[1].score ?? 0;
    if (top.score >= 0.8 && top.score - second >= 0.1) {
      return { rank: topRank, matched: top.matched, autocorrected: true }; // a typo or near-spelling
    }
    // Else: too weak or a near-tie — fall through to the distinctive-part
    // pass below instead of guessing wrong.
  }
  // Pass 3: distinctive-part autocorrect (2026-11-18, Luke: "whale" should
  // become "Blue whale"). The typed input is a recognizable part of exactly
  // one listed answer. Uniqueness is the whole rule: if two or more ranks
  // qualify, the input stays unlisted — the matcher never guesses on a tie
  // ("shark" is four different sharks, "elephant" is three elephants,
  // "right whale" is three right whales). There is deliberately NO
  // highest-rank tiebreak: the bank analysis (VERIFICATION.md) shows the
  // top-ranked candidate is the obvious referent only for "whale" ->
  // Blue whale, and coin-flippy for "ford", "bulldog", "war",
  // "university", "cancer". That one obvious case is a curated bank alias
  // on Q202 rank 1 instead of a rule.
  //
  // The distinctive part of an answer is (almost) always its leading word:
  // "Humpback" in "Humpback whale", "Fin" in "Fin whale". The trailing head
  // noun ("whale", "France") is the shared category word — a bare head noun
  // names the category, not the answer. And a 4-letter word one edit from a
  // different word ("dove" vs "move") is a different word, not a typo.
  // So a single-token input must match the FIRST token of the label (exact,
  // or a typo with the same first letter), and a multi-token input must have
  // every token match some token of the label. A single-token input that is
  // also a proper prefix of a BETTER-ranked first token is ambiguous
  // ("sugar" is rank 9's word but rank 1's "sugarcane" cut short) — unless
  // its exact match outranks every prefix competitor ("blue" is rank 1's
  // word and only a prefix of rank 46's "bluefin").
  const subsetQualifiers = new Map();
  if (subTokens.length === 1) {
    const t = subTokens[0];
    const exactRanks = new Map();
    const prefixRanks = new Map();
    const anyTokenRanks = new Set();
    for (const slot of question.textAnswers || []) {
      for (const txt of slot.texts) {
        const ft = firstToken(txt);
        if (ft) {
          if (tokenMatches(t, ft)) {
            if (!exactRanks.has(slot.rank)) exactRanks.set(slot.rank, slot.texts[0]);
          } else if (ft.startsWith(t) && ft.length > t.length) {
            if (!prefixRanks.has(slot.rank)) prefixRanks.set(slot.rank, slot.texts[0]);
          }
        }
        // The token must not appear ANYWHERE else in the question — not
        // even as a buried token. "elephant" is the first word of rank 18's
        // "Elephant seal" variant, but it is also a token of ranks 14, 15
        // and 17 (the actual elephants), so the player typing "elephant"
        // has not named the seal. Same guard catches "king" (Lion King vs
        // King Kong) for free.
        if (canonicalTokens(txt).includes(t)) anyTokenRanks.add(slot.rank);
      }
    }
    if (exactRanks.size === 1) {
      const [[rank, label]] = [...exactRanks.entries()];
      const tokenElsewhere = [...anyTokenRanks].some((r) => r !== rank);
      const prefixBeats = [...prefixRanks.keys()].some((r) => r < rank);
      if (!tokenElsewhere && !prefixBeats) return { rank, matched: label, autocorrected: true };
    }
  } else {
    for (const slot of question.textAnswers || []) {
      for (const txt of slot.texts) {
        const vTokens = canonicalTokens(txt);
        if (subTokens.length >= vTokens.length) continue;
        const ok = subTokens.every((tok) =>
          vTokens.some((v) => tokenMatches(tok, v)));
        if (ok && !subsetQualifiers.has(slot.rank)) subsetQualifiers.set(slot.rank, slot.texts[0]);
      }
    }
    if (subsetQualifiers.size === 1) {
      const [[rank, label]] = [...subsetQualifiers.entries()];
      return { rank, matched: label, autocorrected: true };
    }
  }
  // 3b truncation: the input is a prefix of exactly one rank's label that
  // ends mid-word (the label continues with a letter), e.g. "blue wh" for
  // "blue whale". A complete first word is not a truncation — pass 3a
  // already decided it (fired, or declined as ambiguous) — so if the typed
  // token exactly equals some rank's first token, the truncation pass does
  // not run ("sugar" must not become rank 1's "sugarcane" after 3a
  // declined it for rank 9's "sugar beet").
  if (norm.length >= 4) {
    let isCompleteWord = false;
    if (subTokens.length === 1) {
      for (const slot of question.textAnswers || []) {
        for (const txt of slot.texts) {
          if (firstToken(txt) === subTokens[0]) { isCompleteWord = true; break; }
        }
        if (isCompleteWord) break;
      }
    }
    if (!isCompleteWord) {
      const subQualifiers = new Map();
      for (const slot of question.textAnswers || []) {
        for (const txt of slot.texts) {
          const nt = normalizeText(txt);
          if (nt.startsWith(norm) && norm.length < nt.length && /[a-z]/.test(nt[norm.length])) {
            if (!subQualifiers.has(slot.rank)) subQualifiers.set(slot.rank, slot.texts[0]);
          }
        }
      }
      if (subQualifiers.size === 1) {
        const [[rank, label]] = [...subQualifiers.entries()];
        return { rank, matched: label, autocorrected: true };
      }
    }
  }
  return { rank: null, matched: null };
}
