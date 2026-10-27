/** What gets saved, and loading it defensively. A backup file or a jsonb column can
 *  hold anything (old versions, hand edits, a half-written value), so everything is
 *  validated on the way in and anything dropped is reported — never a crash. */

import { isDateString } from "./dates.ts";
import { getExercise } from "./library.ts";
import { getLook } from "./looks.ts";
import type { LookId } from "./looks.ts";
import { TIME_OPTIONS, WORKOUT_KEYS } from "./workouts.ts";
import type { TimeOption, WorkoutKey } from "./workouts.ts";
import type { CompletedWorkout, DoneExercise, Feedback, Unit, WeightBook } from "./adapt.ts";
import { CHECKIN_FIELDS } from "./checkin.ts";
import type { Checkin } from "./checkin.ts";
import type { NutritionProfile } from "./nutrition.ts";

export const MAX_WEIGHT = 1000;
export const MAX_NOTE = 500;

export interface Profile {
  lookId: LookId;
  time: TimeOption;
  unit: Unit;
  createdAt: number;
}

export interface Data {
  version: 2;
  profile: Profile | null;
  workouts: CompletedWorkout[];
  weights: WeightBook;
  checkins: Checkin[];
  nutrition: NutritionProfile | null;
}

export const EMPTY_DATA: Data = { version: 2, profile: null, workouts: [], weights: {}, checkins: [], nutrition: null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v) || typeof v.lookId !== "string" || !getLook(v.lookId)) return null;
  return {
    lookId: v.lookId as LookId,
    time: TIME_OPTIONS.includes(v.time as TimeOption) ? (v.time as TimeOption) : "standard",
    unit: v.unit === "kg" ? "kg" : "lb",
    createdAt: isNum(v.createdAt) ? v.createdAt : 0,
  };
}

function parseDone(v: unknown): DoneExercise | null {
  if (!isObj(v) || typeof v.exerciseId !== "string" || !getExercise(v.exerciseId)) return null;
  if (!Number.isInteger(v.setsDone) || (v.setsDone as number) < 0 || (v.setsDone as number) > 20) return null;
  const planned = Number.isInteger(v.setsPlanned) && (v.setsPlanned as number) >= 1 && (v.setsPlanned as number) <= 20 ? (v.setsPlanned as number) : (v.setsDone as number) || 1;
  let weight: number | null = null;
  if (v.weight !== null && v.weight !== undefined) {
    if (!isNum(v.weight) || v.weight < 0 || v.weight > MAX_WEIGHT) return null;
    weight = v.weight;
  }
  const fb = v.feedback === "easy" || v.feedback === "right" || v.feedback === "hard" ? (v.feedback as Feedback) : undefined;
  return { exerciseId: v.exerciseId, setsDone: v.setsDone as number, setsPlanned: planned, weight, ...(fb ? { feedback: fb } : {}), ...(v.skipped === true ? { skipped: true } : {}) };
}

function parseWorkout(v: unknown, fallback: Unit): { workout: CompletedWorkout | null; dropped: number } {
  if (!isObj(v) || typeof v.id !== "string" || !v.id || !isDateString(v.date) || !WORKOUT_KEYS.includes(v.key as WorkoutKey) || !Array.isArray(v.exercises)) {
    return { workout: null, dropped: 1 };
  }
  const exercises: DoneExercise[] = [];
  let dropped = 0;
  for (const e of v.exercises) {
    const d = parseDone(e);
    if (d) exercises.push(d);
    else dropped++;
  }
  if (exercises.length === 0) return { workout: null, dropped: dropped + 1 };
  return {
    workout: {
      id: v.id,
      date: v.date,
      key: v.key as WorkoutKey,
      unit: v.unit === "kg" || v.unit === "lb" ? v.unit : fallback,
      exercises,
      createdAt: isNum(v.createdAt) ? v.createdAt : 0,
      ...(typeof v.note === "string" && v.note.trim() ? { note: v.note.slice(0, MAX_NOTE) } : {}),
    },
    dropped,
  };
}

function parseCheckin(v: unknown, fallback: Unit): Checkin | null {
  if (!isObj(v) || typeof v.id !== "string" || !v.id || !isDateString(v.date)) return null;
  const c: Checkin = { id: v.id, date: v.date, unit: v.unit === "kg" || v.unit === "lb" ? v.unit : fallback, createdAt: isNum(v.createdAt) ? v.createdAt : 0 };
  let any = false;
  for (const { key } of CHECKIN_FIELDS) {
    const n = v[key];
    if (isNum(n) && n > 0 && n < 1000) {
      c[key] = n;
      any = true;
    }
  }
  return any ? c : null;
}

function parseNutrition(v: unknown): NutritionProfile | null {
  if (!isObj(v)) return null;
  const ok =
    Number.isInteger(v.age) && (v.age as number) >= 18 && (v.age as number) <= 90 && (v.sex === "female" || v.sex === "male") &&
    isNum(v.height) && v.height > 0 && v.height < 300 && isNum(v.weight) && v.weight > 0 && v.weight < 700 &&
    (v.unit === "lb" || v.unit === "kg") && (v.activity === "low" || v.activity === "light" || v.activity === "active");
  return ok ? (v as unknown as NutritionProfile) : null;
}

export interface Loaded {
  data: Data;
  /** something unreadable was dropped, so we can say so */
  recovered: boolean;
}

/** Turn a stored string (a backup file) into valid data. Never throws. */
export function parseData(raw: string | null): Loaded {
  if (raw === null || raw === "") return { data: EMPTY_DATA, recovered: false };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { data: EMPTY_DATA, recovered: true };
  }
  return parseDataObject(json);
}

/** Turn already-parsed JSON (a backup, or rows from the database) into valid data. Never throws. */
export function parseDataObject(json: unknown): Loaded {
  if (!isObj(json) || json.version !== 2) return { data: EMPTY_DATA, recovered: true };

  const profile = json.profile === null || json.profile === undefined ? null : parseProfile(json.profile);
  const unit: Unit = profile?.unit ?? "lb";
  let dropped = json.profile && !profile ? 1 : 0;

  const workouts: CompletedWorkout[] = [];
  for (const w of Array.isArray(json.workouts) ? json.workouts : []) {
    const r = parseWorkout(w, unit);
    dropped += r.dropped;
    if (r.workout) workouts.push(r.workout);
  }

  const weights: WeightBook = {};
  if (isObj(json.weights)) {
    for (const [id, m] of Object.entries(json.weights)) {
      if (getExercise(id) && isObj(m) && isNum(m.weight) && m.weight >= 0 && m.weight <= MAX_WEIGHT && (m.unit === "lb" || m.unit === "kg") && isDateString(m.updatedAt)) {
        weights[id] = { weight: m.weight, unit: m.unit, rightStreak: Number.isInteger(m.rightStreak) ? Math.max(0, Math.min(5, m.rightStreak as number)) : 0, updatedAt: m.updatedAt };
      } else dropped++;
    }
  }

  const checkins: Checkin[] = [];
  for (const c of Array.isArray(json.checkins) ? json.checkins : []) {
    const p = parseCheckin(c, unit);
    if (p) checkins.push(p);
    else dropped++;
  }

  const nutrition = json.nutrition ? parseNutrition(json.nutrition) : null;
  if (json.nutrition && !nutrition) dropped++;

  return { data: { version: 2, profile, workouts, weights, checkins, nutrition }, recovered: dropped > 0 };
}

export function serialize(data: Data): string {
  return JSON.stringify(data);
}

/* ---- units: saved data is never rewritten; conversion happens only for display ---- */

const LB_PER_KG = 2.2046226218;

export function convertWeight(w: number, from: Unit, to: Unit): number {
  if (from === to) return w;
  const raw = from === "lb" ? w / LB_PER_KG : w * LB_PER_KG;
  return Math.round(raw * 2) / 2;
}

export function workoutsIn(workouts: CompletedWorkout[], to: Unit): CompletedWorkout[] {
  return workouts.map((w) =>
    w.unit === to ? w : { ...w, unit: to, exercises: w.exercises.map((e) => ({ ...e, weight: e.weight === null ? null : convertWeight(e.weight, w.unit, to) })) },
  );
}

export function weightsIn(book: WeightBook, to: Unit): WeightBook {
  const out: WeightBook = {};
  for (const [id, m] of Object.entries(book)) out[id] = m.unit === to ? m : { ...m, weight: convertWeight(m.weight, m.unit, to), unit: to };
  return out;
}

export function fmtWeight(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}
