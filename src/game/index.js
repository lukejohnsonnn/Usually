// Honeydle game logic — one pure module (rules + text matching).
export * from "./rules.js";
export { matchTextAnswer, normalizeText, canonicalTokens, levenshtein, groupSize, alignWordBreaks } from "./match.js";
