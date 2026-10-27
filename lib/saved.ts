/** Exercises saved from the wger library: one row each in `saved_exercises`.
 *  Rows are checked on the way in like everything else, and the shape sent back
 *  matches the table's own checks (name length, wger-only images, note length). */

import type { WgerExercise } from "./wger.ts";

export const MAX_SAVED_NOTE = 280;
const MAX_NAME = 200;
const MAX_TAGS = 12;

export interface SavedExercise {
  wgerId: number;
  name: string;
  muscles: string[];
  equipment: string[];
  imageUrl: string | null;
  note: string;
  savedAt: number;
}

export interface SavedRow {
  wger_id: number;
  name: string;
  muscles: unknown;
  equipment: unknown;
  image_url: string | null;
  note: string | null;
  saved_at: string;
}

export const SAVED_COLUMNS = "wger_id,name,muscles,equipment,image_url,note,saved_at";

const tags = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim().slice(0, 60)).slice(0, MAX_TAGS) : [];

function wgerImage(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname === "wger.de" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Rows from the database → saved exercises, newest first; anything malformed is counted, not shown. */
export function parseSaved(rows: unknown[]): { saved: SavedExercise[]; dropped: number } {
  const saved: SavedExercise[] = [];
  let dropped = 0;
  for (const r of rows) {
    const row = r as Partial<SavedRow> | null;
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (!row || !Number.isInteger(row.wger_id) || (row.wger_id as number) <= 0 || !name) {
      dropped++;
      continue;
    }
    const t = Date.parse(typeof row.saved_at === "string" ? row.saved_at : "");
    saved.push({
      wgerId: row.wger_id as number,
      name: name.slice(0, MAX_NAME),
      muscles: tags(row.muscles),
      equipment: tags(row.equipment),
      imageUrl: wgerImage(row.image_url),
      note: typeof row.note === "string" ? row.note.slice(0, MAX_SAVED_NOTE) : "",
      savedAt: Number.isFinite(t) ? t : 0,
    });
  }
  saved.sort((a, b) => b.savedAt - a.savedAt);
  return { saved, dropped };
}

/** What gets kept when an exercise from the library is saved. */
export function savedFrom(ex: WgerExercise, now: number): SavedExercise {
  return {
    wgerId: ex.id,
    name: ex.name.trim().slice(0, MAX_NAME),
    muscles: tags(ex.muscles),
    equipment: tags(ex.equipment),
    imageUrl: wgerImage(ex.imageUrl),
    note: "",
    savedAt: now,
  };
}

/** The row for an upsert on (user_id, wger_id). user_id is never sent: the database fills it from the token. */
export function savedRow(s: SavedExercise) {
  return {
    wger_id: s.wgerId,
    name: s.name,
    muscles: s.muscles,
    equipment: s.equipment,
    image_url: s.imageUrl,
    note: s.note,
    saved_at: new Date(s.savedAt > 0 ? s.savedAt : Date.now()).toISOString(),
  };
}

export function validateNote(text: string): { note: string } | { error: string } {
  const note = text.trim();
  if (note.length > MAX_SAVED_NOTE) {
    return { error: `Keep the note to ${MAX_SAVED_NOTE} characters — it's ${note.length} now.` };
  }
  return { note };
}
