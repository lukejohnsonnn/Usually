// Node-only loaders for the bank and overrides (local dev and tests).
// The Worker imports the same JSON files directly instead.
import fs from "node:fs";
import { prepareBank, prepareOverrides } from "./service.js";

export function loadBank(filePath) {
  return prepareBank(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

/** The schedule of upcoming Dailies (data/schedule.json) as pins, never resetting plays. */
export function loadSchedule(filePath, bank) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const { days = [] } = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return prepareOverrides(days.map((d) => ({ date: d.date, ids: d.ids, resetPlays: false })), bank);
  } catch (err) {
    console.warn(`[schedule] unreadable ${filePath}: ${err.message}`);
    return [];
  }
}

export function loadOverrides(filePath, bank) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return prepareOverrides(JSON.parse(fs.readFileSync(filePath, "utf8")), bank);
  } catch (err) {
    console.warn(`[overrides] unreadable ${filePath}: ${err.message}`);
    return [];
  }
}
