// Hive Hunt — the bonus game. One list a day, the same for everyone: name as
// many entries as you can in HUNT_SECONDS. The list and the clock live on the
// server; entries are only revealed once a hunt is finished.
import { GameError } from "./service.js";
import { matchTextAnswer, normalizeText, groupSize, addDays, isDateStr } from "./game/index.js";

export const HUNT_SECONDS = 60;
const GRACE_MS = 3000; // network slack after the clock runs out

/** Validate the parsed hunts.json. Bad lists are skipped loudly. */
export function prepareHunts(raw) {
  const lists = (raw?.lists || []).filter((l) => {
    const ok = Number.isInteger(l.id) && l.prompt && Array.isArray(l.entries) && l.entries.length >= 5
      && l.entries.every((e) => Array.isArray(e) && e.length && e.every((t) => typeof t === "string"));
    if (!ok) console.warn(`[hunt] skipping invalid list ${l?.id}`);
    return ok;
  });
  // optional per-day clock: { "2026-11-21": 150 } gives that day's hunt 150 seconds
  const seconds = Object.fromEntries(Object.entries(raw?.seconds || {}).filter(([d, s]) => isDateStr(d) && Number.isInteger(s) && s >= 10 && s <= 600));
  // optional per-day list swap: { "2026-11-23": 15 } uses list 15 that day instead of the rotation
  const ids = new Set(lists.map((l) => l.id));
  const days = Object.fromEntries(Object.entries(raw?.days || {}).filter(([d, id]) => isDateStr(d) && ids.has(id)));
  return { start: isDateStr(raw?.start) ? raw.start : "2026-11-20", lists, seconds, days };
}

const huntNumber = (start, date) => {
  const [a, b] = [date, start].map((d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); });
  return Math.round((a - b) / 86_400_000) + 1;
};

/** The matcher wants a "question": each entry becomes its own rank. */
const asQuestion = (list) => ({
  textAnswers: list.entries.map((texts, i) => ({ rank: i + 1, texts })),
  unlisted: list.unlisted || [],
});

const newId = () => "h-" + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9))))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createHunt({ store, hunts, now = () => new Date(), today }) {
  const { start, lists, seconds = {}, days = {} } = hunts;
  const byId = new Map(lists.map((l) => [l.id, l]));
  // lists marked "rotate": false are only used when a day asks for them
  const rotation = lists.filter((l) => l.rotate !== false);
  const secondsOn = (date) => seconds[date] || HUNT_SECONDS;
  const questions = new Map(lists.map((l) => [l.id, asQuestion(l)]));

  /**
   * A day's list: a hunt already under way keeps the list it started with; otherwise a
   * per-day swap if there is one; otherwise the rotation from the start date.
   */
  function listFor(date, play = null) {
    if (!rotation.length) throw new GameError(503, "Hive Hunt isn't available right now.");
    const n = Math.max(1, huntNumber(start, date));
    const started = play && byId.get(play.snapshot?.[0]?.huntList);
    return { list: started || byId.get(days[date]) || rotation[(n - 1) % rotation.length], number: n };
  }

  const label = (list, i) => list.entries[i][0];
  const startedAt = (play) => Date.parse(play.snapshot[0].startedAt);
  const endsAt = (play) => startedAt(play) + secondsOn(play.date) * 1000;
  const timeLeftMs = (play) => Math.max(0, endsAt(play) - now().getTime());

  /** What the client may see. Missed entries only once the hunt is over. */
  function view(list, number, date, play) {
    // The list is a surprise: before the clock starts, neither the prompt nor its size goes out.
    if (!play) return { date, number, prompt: null, total: null, seconds: secondsOn(date), status: "new", found: [], score: 0 };
    const out = { date, number, prompt: list.prompt, total: list.entries.length, seconds: secondsOn(date), status: "new", found: [], score: 0 };
    out.found = play.results.map((i) => label(list, i));
    out.score = play.results.length;
    if (play.completedAt) {
      out.status = "done";
      const got = new Set(play.results);
      out.missed = list.entries.map((_, i) => i).filter((i) => !got.has(i)).map((i) => label(list, i)).sort((a, b) => a.localeCompare(b));
      out.source = list.source;
    } else {
      out.status = "playing";
      out.secondsLeft = Math.ceil(timeLeftMs(play) / 1000);
    }
    return out;
  }

  async function finishIfExpired(play) {
    if (play && !play.completedAt && now().getTime() > endsAt(play) + GRACE_MS) {
      play.completedAt = new Date(endsAt(play)).toISOString();
      await store.savePlay(play);
    }
    return play;
  }

  async function state(playerId) {
    const date = today();
    const play = await finishIfExpired(await store.findDailyPlay(playerId, date, "hunt"));
    const { list, number } = listFor(date, play);
    return view(list, number, date, play);
  }

  /** Start the clock (or return the hunt already under way / finished). */
  async function begin(playerId) {
    const date = today();
    let play = await finishIfExpired(await store.findDailyPlay(playerId, date, "hunt"));
    const { list, number } = listFor(date, play);
    if (!play) {
      play = await store.createPlay({
        id: newId(), playerId, mode: "hunt", date,
        questionIds: [list.id],
        snapshot: [{ huntList: list.id, startedAt: now().toISOString() }],
        results: [], score: 0, completedAt: null,
      });
    }
    return view(list, number, date, play);
  }

  /** One typed answer. Never reveals anything that isn't on the player's own found list. */
  async function guess(playerId, value) {
    const date = today();
    const play = await finishIfExpired(await store.findDailyPlay(playerId, date, "hunt"));
    if (!play) throw new GameError(409, "Start the hunt first.");
    const { list, number } = listFor(date, play);
    if (play.completedAt) return { result: "over", hunt: view(list, number, date, play) };
    const typed = typeof value === "string" ? value.slice(0, 80) : "";
    if (!normalizeText(typed)) return { result: "blank" };
    const m = matchTextAnswer(questions.get(list.id), typed);
    if (m.rank == null) return m.ambiguous ? { result: "ambiguous", count: groupSize(questions.get(list.id), typed) } : { result: "miss" };
    const i = m.rank - 1;
    if (play.results.includes(i)) return { result: "already", label: label(list, i) };
    play.results.push(i);
    play.score = play.results.length;
    if (play.results.length === list.entries.length) play.completedAt = now().toISOString(); // found them all
    await store.savePlay(play);
    return { result: "found", label: label(list, i), hunt: view(list, number, date, play) };
  }

  /** End the hunt (the clock ran out, or the player gave up). */
  async function finish(playerId) {
    const date = today();
    const play = await store.findDailyPlay(playerId, date, "hunt");
    if (!play) throw new GameError(409, "Start the hunt first.");
    const { list, number } = listFor(date, play);
    if (!play.completedAt) {
      play.completedAt = now().toISOString();
      await store.savePlay(play);
    }
    return view(list, number, date, play);
  }

  return { state, begin, guess, finish, listFor, addDays };
}
