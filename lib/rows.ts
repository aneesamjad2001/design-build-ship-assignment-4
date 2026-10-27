/** Rows in Supabase ↔ the app's data. Pure, so it can be tested without a database.
 *
 *  Reading: rows are reshaped into the same form a backup file has and go through the
 *  same validators (data.ts), so a bad jsonb value is dropped and reported, never trusted.
 *  Writing: user_id is never sent. The database fills it from the session token, and
 *  row-level security refuses any other value. */

import { CHECKIN_FIELDS } from "./checkin.ts";
import type { Checkin } from "./checkin.ts";
import { parseDataObject } from "./data.ts";
import type { Data, Loaded } from "./data.ts";
import type { CompletedWorkout } from "./adapt.ts";

export interface ProfileRow {
  look_id: string;
  time: string;
  unit: string;
  weights: unknown;
  nutrition: unknown;
  created_at: string;
}

export interface WorkoutRow {
  id: string;
  date: string;
  key: string;
  unit: string;
  note: string | null;
  exercises: unknown;
  created_at: string;
}

export interface CheckinRow {
  id: string;
  date: string;
  answers: unknown;
  created_at: string;
}

export const PROFILE_COLUMNS = "look_id,time,unit,weights,nutrition,created_at";
export const WORKOUT_COLUMNS = "id,date,key,unit,note,exercises,created_at";
export const CHECKIN_COLUMNS = "id,date,answers,created_at";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ms = (t: string) => {
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : 0;
};
/** Always set, so rows in one bulk upsert share their columns (a missing one would be sent as null).
 *  Old backups can lack a time; noon on the row's own date keeps the order sensible. */
const createdAt = (n: number, date: string) => (n > 0 ? new Date(n).toISOString() : `${date}T12:00:00.000Z`);

export function fromRows(profile: ProfileRow | null, workouts: WorkoutRow[], checkins: CheckinRow[]): Loaded {
  return parseDataObject({
    version: 2,
    profile: profile ? { lookId: profile.look_id, time: profile.time, unit: profile.unit, createdAt: ms(profile.created_at) } : null,
    workouts: workouts.map((w) => ({ id: w.id, date: w.date, key: w.key, unit: w.unit, note: w.note ?? "", exercises: w.exercises, createdAt: ms(w.created_at) })),
    weights: profile?.weights ?? {},
    // the row's own id and date win over anything inside answers
    checkins: checkins.map((c) => ({ ...(isObj(c.answers) ? c.answers : {}), id: c.id, date: c.date, createdAt: ms(c.created_at) })),
    nutrition: profile?.nutrition ?? null,
  });
}

/** The profile row for an upsert, or null when there is no profile yet. created_at is left to the database. */
export function profileRow(d: Data) {
  if (!d.profile) return null;
  const { lookId, time, unit } = d.profile;
  return { look_id: lookId, time, unit, weights: d.weights, nutrition: d.nutrition };
}

export function workoutRow(w: CompletedWorkout) {
  return { id: w.id, date: w.date, key: w.key, unit: w.unit, note: w.note ?? "", exercises: w.exercises, created_at: createdAt(w.createdAt, w.date) };
}

export function checkinRow(c: Checkin) {
  const answers: Record<string, unknown> = { unit: c.unit };
  for (const { key } of CHECKIN_FIELDS) if (c[key] !== undefined) answers[key] = c[key];
  return { id: c.id, date: c.date, answers, created_at: createdAt(c.createdAt, c.date) };
}
