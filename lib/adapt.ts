/** What to do next, from what was done. The "memory" of the app. */

import { daysBetween } from "./dates.ts";
import { getExercise } from "./library.ts";
import type { Exercise } from "./library.ts";
import { WORKOUT_KEYS, feelingWeightFactor, reentry } from "./workouts.ts";
import type { Feeling, WorkoutKey } from "./workouts.ts";

export type Unit = "lb" | "kg";
export type Feedback = "easy" | "right" | "hard";

export interface DoneExercise {
  exerciseId: string;
  setsDone: number;
  setsPlanned: number;
  /** the weight used, in `unit` of the workout; null for bodyweight / not recorded */
  weight: number | null;
  feedback?: Feedback;
  skipped?: boolean;
}

export interface CompletedWorkout {
  id: string;
  date: string;
  key: WorkoutKey;
  unit: Unit;
  exercises: DoneExercise[];
  note?: string;
  createdAt: number;
}

export interface WeightMemory {
  weight: number;
  unit: Unit;
  /** consecutive "just right" sessions at this weight */
  rightStreak: number;
  updatedAt: string;
}

export type WeightBook = Record<string, WeightMemory>;

export function lastWorkout(workouts: CompletedWorkout[]): CompletedWorkout | undefined {
  let best: CompletedWorkout | undefined;
  for (const w of workouts) {
    if (!best || w.date > best.date || (w.date === best.date && w.createdAt > best.createdAt)) best = w;
  }
  return best;
}

export function completion(w: CompletedWorkout): number {
  const planned = w.exercises.reduce((n, e) => n + e.setsPlanned, 0);
  if (planned === 0) return 1;
  return w.exercises.reduce((n, e) => n + Math.min(e.setsDone, e.setsPlanned), 0) / planned;
}

export interface NextUp {
  key: WorkoutKey;
  /** the same workout again because last time was mostly unfinished */
  repeat: boolean;
  isFirst: boolean;
  daysAway: number | null;
  makeUps: string[];
  /** one plain sentence explaining the choice */
  reason: string;
}

export function nextWorkout(workouts: CompletedWorkout[], today: string): NextUp {
  const last = lastWorkout(workouts);
  if (!last) {
    return { key: "A", repeat: false, isFirst: true, daysAway: null, makeUps: [], reason: "Your first workout — a light intro to learn the moves." };
  }
  const daysAway = Math.max(0, daysBetween(last.date, today));
  const done = completion(last);
  if (done < 0.5) {
    return {
      key: last.key,
      repeat: true,
      isFirst: false,
      daysAway,
      makeUps: [],
      reason: `You did about half of Workout ${last.key} last time, so let's finish it before moving on.`,
    };
  }
  const key = WORKOUT_KEYS[(WORKOUT_KEYS.indexOf(last.key) + 1) % WORKOUT_KEYS.length];
  const makeUps = last.exercises.filter((e) => e.skipped || e.setsDone === 0).map((e) => e.exerciseId).slice(0, 2);
  return { key, repeat: false, isFirst: false, daysAway, makeUps, reason: `Next in your plan after Workout ${last.key}.` };
}

/** How much weight changes by in one step. */
export function weightStep(e: Exercise, unit: Unit): number {
  if (e.pattern === "isolation") return unit === "lb" ? 2.5 : 1;
  // one dumbbell (goblet and split squats) moves in dumbbell steps, not machine/barbell steps
  if (e.lower && e.id !== "goblet-squat" && e.id !== "split-squat") return unit === "lb" ? 10 : 5;
  return unit === "lb" ? 5 : 2.5;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** The weight to start with: what was last used, eased down after time away or on a
 *  tired day. Null = unknown. */
export function suggestedWeight(
  exerciseId: string,
  book: WeightBook,
  daysAway: number | null | undefined,
  unit: Unit,
  feeling?: Feeling,
): number | null {
  const e = getExercise(exerciseId);
  const m = book[exerciseId];
  if (!e || !e.weighted || !m || m.unit !== unit) return null;
  const step = weightStep(e, unit);
  // each easing (a gap, then a tired day) is always at least one step lighter:
  // rounding alone could leave the weight unchanged
  const ease = (from: number, factor: number) => (factor === 1 ? from : Math.min(roundTo(from * factor, step), from - step));
  const w = ease(ease(m.weight, reentry(daysAway).weightFactor), feelingWeightFactor(feeling));
  return Math.max(0, w);
}

/**
 * After a workout: remember the weight used and decide where it goes next.
 *  easy  → go up one step
 *  right → hold; after two "right" sessions in a row, go up one step
 *  hard  → drop about 10%
 */
export function nextWeight(e: Exercise, used: number, feedback: Feedback | undefined, prev: WeightMemory | undefined, unit: Unit, date: string): WeightMemory {
  const step = weightStep(e, unit);
  const fb = feedback ?? "right";
  const sameUnitStreak = prev && prev.unit === unit ? prev.rightStreak : 0;
  if (fb === "easy") return { weight: used + step, unit, rightStreak: 0, updatedAt: date };
  if (fb === "hard") return { weight: Math.max(0, roundTo(used * 0.9, step)), unit, rightStreak: 0, updatedAt: date };
  const streak = sameUnitStreak + 1;
  if (streak >= 2) return { weight: used + step, unit, rightStreak: 0, updatedAt: date };
  return { weight: used, unit, rightStreak: streak, updatedAt: date };
}

/** Fold a finished workout's weights and feedback into the book. */
export function updateBook(book: WeightBook, w: CompletedWorkout): WeightBook {
  const next = { ...book };
  for (const d of w.exercises) {
    const e = getExercise(d.exerciseId);
    if (!e || !e.weighted || d.skipped || d.setsDone === 0 || d.weight == null) continue;
    next[d.exerciseId] = nextWeight(e, d.weight, d.feedback, book[d.exerciseId], w.unit, w.date);
  }
  return next;
}

export function totalWorkouts(workouts: CompletedWorkout[]): number {
  return workouts.length;
}

/** Workouts in the last `days` days up to and including `today`. */
export function recentCount(workouts: CompletedWorkout[], today: string, days = 28): number {
  return workouts.filter((w) => {
    const d = daysBetween(w.date, today);
    return d >= 0 && d < days;
  }).length;
}
