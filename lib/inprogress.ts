/** A workout in progress, saved as you go so a locked phone or a stray tap
 *  never loses your place. Separate from the saved history.
 *
 *  It is the one thing kept in the browser, and the browser is shared, not personal:
 *  the key includes the signed-in Clerk user id, nothing is read or written while no
 *  one is signed in, and every other person's draft is removed (see keepOnlyInProgress). */

import { getExercise } from "./library.ts";
import { TIME_OPTIONS, WORKOUT_KEYS } from "./workouts.ts";
import type { Feeling, PlannedWorkout, TimeOption, WorkoutKey } from "./workouts.ts";
import type { Feedback, Unit } from "./adapt.ts";

export const INPROGRESS_KEY = "ironlog:workout:v2";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface Progress {
  setsDone: number;
  /** the weight as typed (text, so a half-typed number survives) */
  weight: string;
  feedback?: Feedback;
  skipped?: boolean;
}

export interface InProgress {
  startedAt: number;
  unit: Unit;
  feeling: Feeling;
  planned: PlannedWorkout;
  /** which exercise card is showing */
  index: number;
  progress: Record<string, Progress>;
  note: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseInProgress(raw: string | null, now: number): InProgress | null {
  if (!raw) return null;
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(j) || typeof j.startedAt !== "number" || now - j.startedAt > MAX_AGE_MS || now < j.startedAt - 60_000) return null;
  if (j.unit !== "lb" && j.unit !== "kg") return null;
  if (j.feeling !== "fresh" && j.feeling !== "normal" && j.feeling !== "tired") return null;
  const p = j.planned;
  if (!isObj(p) || !WORKOUT_KEYS.includes(p.key as WorkoutKey) || !TIME_OPTIONS.includes(p.time as TimeOption)) return null;
  if (!Array.isArray(p.exercises) || p.exercises.length === 0 || p.exercises.length > 20) return null;
  for (const e of p.exercises) {
    if (!isObj(e) || typeof e.exerciseId !== "string" || !getExercise(e.exerciseId)) return null;
    if (![e.sets, e.min, e.max].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  }
  if (typeof j.index !== "number" || !Number.isInteger(j.index) || j.index < 0 || j.index > p.exercises.length) return null;
  if (!isObj(j.progress)) return null;
  const progress: Record<string, Progress> = {};
  for (const [id, v] of Object.entries(j.progress)) {
    if (!getExercise(id) || !isObj(v)) continue;
    if (typeof v.setsDone !== "number" || typeof v.weight !== "string" || v.weight.length > 12) continue;
    const fb = v.feedback === "easy" || v.feedback === "right" || v.feedback === "hard" ? v.feedback : undefined;
    progress[id] = { setsDone: Math.max(0, Math.min(20, Math.floor(v.setsDone))), weight: v.weight, ...(fb ? { feedback: fb } : {}), ...(v.skipped === true ? { skipped: true } : {}) };
  }
  return {
    startedAt: j.startedAt,
    unit: j.unit,
    feeling: j.feeling,
    planned: p as unknown as PlannedWorkout,
    index: j.index,
    progress,
    note: typeof j.note === "string" ? j.note.slice(0, 500) : "",
  };
}

export const inProgressKey = (userId: string) => `${INPROGRESS_KEY}:${userId}`;

/** whose draft the read/write/clear calls below touch; null while signed out */
let owner: string | null = null;

export function setInProgressOwner(userId: string | null) {
  owner = userId;
}

export function readInProgress(now: number = Date.now()): InProgress | null {
  if (!owner) return null;
  try {
    return parseInProgress(window.localStorage.getItem(inProgressKey(owner)), now);
  } catch {
    return null;
  }
}

export function writeInProgress(w: InProgress) {
  if (!owner) return;
  try {
    window.localStorage.setItem(inProgressKey(owner), JSON.stringify(w));
  } catch {
    /* a convenience, never a requirement */
  }
}

export function clearInProgress() {
  if (!owner) return;
  try {
    window.localStorage.removeItem(inProgressKey(owner));
  } catch {
    /* ignore */
  }
}

/** Remove every in-progress draft in this browser except `userId`'s (all of them when
 *  signed out), including the old unscoped key from before accounts. */
export function keepOnlyInProgress(userId: string | null) {
  try {
    const keep = userId ? inProgressKey(userId) : null;
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(INPROGRESS_KEY) && k !== keep) doomed.push(k);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* storage blocked: there is nothing to remove */
  }
}
