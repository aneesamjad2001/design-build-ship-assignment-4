/**
 * Turns a look into workouts. Plain rules, no AI, so every choice can be explained.
 *
 * The plan is three full-body workouts (A, B, C) that repeat. They are not tied to
 * days of the week: whenever someone goes, they do the next one. Every workout
 * trains the whole body, so a missed week never leaves a gap, and the look decides
 * the extras (rep style, accessory exercises, a cardio finisher).
 */

import { getExercise } from "./library.ts";
import type { Exercise, MuscleGroup } from "./library.ts";
import type { Look, LookId, Style } from "./looks.ts";

export type WorkoutKey = "A" | "B" | "C";
export const WORKOUT_KEYS: WorkoutKey[] = ["A", "B", "C"];

export type TimeOption = "short" | "standard" | "long";
export const TIME_OPTIONS: TimeOption[] = ["short", "standard", "long"];

export type Feeling = "fresh" | "normal" | "tired";

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  /** reps, seconds or minutes depending on the exercise's measure */
  min: number;
  max: number;
  /** part of the essential full-body core of the workout (kept in a short session) */
  core: boolean;
  /** why this one is here, when it isn't obvious ("Skipped last time") */
  note?: string;
}

export interface PlannedWorkout {
  key: WorkoutKey;
  lookId: LookId;
  time: TimeOption;
  exercises: PlannedExercise[];
  /** rough length including warm-up and rests, rounded to 5 */
  minutes: number;
  /** plain-language adjustments that were applied ("Light intro", "Easing back in") */
  notes: string[];
}

export interface BuildContext {
  /** the very first workout: lighter, to learn the moves */
  intro?: boolean;
  /** whole days since the last workout (null = never) */
  daysAway?: number | null;
  feeling?: Feeling;
  /** exercises skipped last time, to fit in again */
  makeUps?: string[];
  /** "not available" replacements chosen this session: original id -> replacement id */
  swaps?: Record<string, string>;
}

const BASE: Record<WorkoutKey, { id: string; core: boolean }[]> = {
  A: [
    { id: "goblet-squat", core: true },
    { id: "dumbbell-bench-press", core: true },
    { id: "seated-cable-row", core: true },
    { id: "romanian-deadlift", core: true },
    { id: "plank", core: false },
  ],
  B: [
    { id: "hip-thrust", core: true },
    { id: "dumbbell-shoulder-press", core: true },
    { id: "lat-pulldown", core: true },
    { id: "split-squat", core: true },
    { id: "dead-bug", core: false },
  ],
  C: [
    { id: "leg-press", core: true },
    { id: "incline-dumbbell-press", core: true },
    { id: "one-arm-dumbbell-row", core: true },
    { id: "leg-curl", core: true },
    { id: "hanging-knee-raise", core: false },
  ],
};

/** Extra exercises for a muscle group, best first. */
const POOL: Record<MuscleGroup, string[]> = {
  chest: ["push-up", "incline-dumbbell-press", "dumbbell-bench-press"],
  back: ["face-pull", "one-arm-dumbbell-row", "seated-cable-row"],
  shoulders: ["lateral-raise", "face-pull"],
  biceps: ["dumbbell-curl", "hammer-curl"],
  triceps: ["triceps-pushdown"],
  quads: ["leg-extension", "split-squat"],
  hamstrings: ["leg-curl", "romanian-deadlift"],
  glutes: ["hip-thrust", "split-squat"],
  calves: ["calf-raise"],
  core: ["cable-crunch", "hanging-knee-raise", "dead-bug"],
};

/** Accessories when a look has no emphasis: an even spread. */
const EVEN_EXTRAS: Record<WorkoutKey, string[]> = {
  A: ["lateral-raise", "triceps-pushdown", "calf-raise"],
  B: ["dumbbell-curl", "calf-raise", "lateral-raise"],
  C: ["face-pull", "triceps-pushdown", "dumbbell-curl"],
};

interface Scheme {
  sets: number;
  min: number;
  max: number;
}

const MAIN: Record<Style, Scheme> = {
  size: { sets: 3, min: 8, max: 12 },
  strength: { sets: 4, min: 5, max: 8 },
  tone: { sets: 3, min: 12, max: 15 },
  athletic: { sets: 3, min: 8, max: 12 },
};

const ACCESSORY: Record<Style, Scheme> = {
  size: { sets: 3, min: 10, max: 15 },
  strength: { sets: 3, min: 8, max: 12 },
  tone: { sets: 3, min: 12, max: 15 },
  athletic: { sets: 3, min: 12, max: 15 },
};

/** Timed, core and cardio movements ignore the rep style. */
function schemeFor(e: Exercise, role: "main" | "accessory", style: Style): Scheme {
  if (e.measure === "minutes") return { sets: 1, min: 5, max: 5 };
  if (e.measure === "seconds") return { sets: 3, min: 20, max: 30 };
  if (e.pattern === "core") return e.id === "cable-crunch" ? { sets: 3, min: 10, max: 15 } : { sets: 3, min: 8, max: 12 };
  return role === "main" ? MAIN[style] : ACCESSORY[style];
}

/** What a few weeks away does to the plan. Conventions, not measured detraining. */
export function reentry(daysAway: number | null | undefined): { setsCap: number | null; setsMinus: number; weightFactor: number; note: string | null } {
  if (daysAway == null || daysAway < 14) return { setsCap: null, setsMinus: 0, weightFactor: 1, note: null };
  const weeks = Math.floor(daysAway / 7);
  if (daysAway < 28) return { setsCap: null, setsMinus: 1, weightFactor: 0.9, note: `Welcome back after ${weeks} weeks — easing in with one fewer set and slightly lighter weights.` };
  if (daysAway < 56) return { setsCap: 2, setsMinus: 0, weightFactor: 0.8, note: `Welcome back after ${weeks} weeks — easing in with two sets and lighter weights, then building back up.` };
  return { setsCap: 2, setsMinus: 0, weightFactor: 0.7, note: `Welcome back after ${weeks} weeks — easing in with two sets and much lighter weights. Your strength comes back faster than it was built.` };
}

function minutesFor(exercises: PlannedExercise[]): number {
  let total = 5; // warm-up
  for (const p of exercises) {
    const e = getExercise(p.exerciseId);
    if (!e) continue;
    if (e.measure === "minutes") total += p.max;
    else if (e.measure === "seconds") total += (p.sets * (p.max + e.restSec)) / 60 + 0.5;
    else total += (p.sets * (40 + e.restSec)) / 60 + 1;
  }
  return Math.max(10, Math.round(total / 5) * 5);
}

export function workoutTitle(key: WorkoutKey): string {
  return `Workout ${key}`;
}

export function buildWorkout(look: Look, key: WorkoutKey, time: TimeOption, ctx: BuildContext = {}): PlannedWorkout {
  const notes: string[] = [];
  const keyIndex = WORKOUT_KEYS.indexOf(key);
  const emphasised = new Set<MuscleGroup>(look.emphasis);
  const used = new Set<string>();
  const out: PlannedExercise[] = [];

  const add = (id: string, core: boolean, role: "main" | "accessory", note?: string) => {
    const e = getExercise(id);
    if (!e || used.has(id)) return;
    used.add(id);
    const s = schemeFor(e, role, look.style);
    let sets = s.sets;
    // extra work for the muscles this look is built around
    if (role === "main" && e.muscles.some((m) => emphasised.has(m))) sets = Math.min(look.style === "strength" ? 5 : 4, sets + 1);
    out.push({ exerciseId: id, sets, min: s.min, max: s.max, core, ...(note ? { note } : {}) });
  };

  // 1. the full-body core of this workout
  for (const slot of BASE[key]) add(slot.id, slot.core, "main");

  // 2. extras chosen for the look (skipped in a short session and in the intro)
  const accessoryCount = time === "short" || ctx.intro ? 0 : time === "long" ? 3 : 2;
  let added = 0;
  if (look.emphasis.length > 0) {
    for (let slot = 0; added < accessoryCount && slot < accessoryCount * 3; slot++) {
      const muscle = look.emphasis[(slot + keyIndex) % look.emphasis.length];
      const pool = POOL[muscle];
      for (let i = 0; i < pool.length; i++) {
        const id = pool[(keyIndex + i) % pool.length];
        if (!used.has(id)) {
          add(id, false, "accessory");
          added++;
          break;
        }
      }
    }
  } else {
    for (const id of EVEN_EXTRAS[key]) {
      if (added >= accessoryCount) break;
      if (!used.has(id)) {
        add(id, false, "accessory");
        added++;
      }
    }
  }

  // 3. exercises skipped last time
  if (time !== "short" && !ctx.intro) {
    for (const id of (ctx.makeUps ?? []).slice(0, time === "long" ? 2 : 1)) add(id, false, "accessory", "Skipped last time");
  }

  // 4. a short cardio finisher for looks that call for one
  if (look.finisher && !ctx.intro && ctx.feeling !== "tired" && time !== "short") {
    const walk = getExercise("incline-walk");
    if (walk) {
      const m = time === "long" ? 10 : 5;
      out.push({ exerciseId: "incline-walk", sets: 1, min: m, max: m, core: false });
      used.add("incline-walk");
    }
  }

  // 5. time: a short session keeps only the essentials, at two sets
  let list = out;
  if (time === "short") {
    list = out.filter((p) => p.core).map((p) => ({ ...p, sets: Math.min(p.sets, 2) }));
    notes.push("Short on time: just the essentials, two sets each.");
  }

  // 6. adjustments for how the person is arriving
  if (ctx.intro) {
    list = list.map((p) => ({ ...p, sets: Math.min(p.sets, 2) }));
    notes.push("Light intro: two sets of each to learn the moves and find your starting weights.");
  }
  const back = reentry(ctx.daysAway);
  if (back.note && !ctx.intro) {
    list = list.map((p) => {
      const e = getExercise(p.exerciseId);
      if (!e || e.measure === "minutes") return p;
      let sets = p.sets - back.setsMinus;
      if (back.setsCap != null) sets = Math.min(sets, back.setsCap);
      return { ...p, sets: Math.max(2, sets) };
    });
    notes.push(back.note);
  }
  // how they feel comes last, so it always shows (the line under the picker explains it)
  list = applyFeeling(list, ctx.feeling ?? "normal", look.style);

  // 7. "not available" replacements chosen this session
  if (ctx.swaps) {
    list = list.map((p) => {
      const to = ctx.swaps![p.exerciseId];
      return to && getExercise(to) ? { ...p, exerciseId: to } : p;
    });
  }

  return { key, lookId: look.id, time, exercises: list, minutes: minutesFor(list), notes };
}

/* ------------------------------------------------------------------ */
/* How are you feeling? Every answer changes today's numbers.            */
/* ------------------------------------------------------------------ */

/** Tired: suggested weights are about this much lighter (always at least one step). */
export const TIRED_WEIGHT_FACTOR = 0.9;

export function feelingWeightFactor(feeling: Feeling | undefined): number {
  return feeling === "tired" ? TIRED_WEIGHT_FACTOR : 1;
}

/** Fresh adds a set to this many main lifts. Two keeps the session close to the
 *  length that was chosen (a set is about two minutes). */
const FRESH_EXTRA_LIFTS = 2;

/**
 * The feeling rules. They run after time, intro and re-entry, so they always show,
 * including on a first workout:
 *  tired  → extras and finisher dropped, one set fewer (never below two), the top of
 *           each rep range two lower (holds five seconds shorter); suggested weights
 *           lighter via feelingWeightFactor
 *  normal → unchanged
 *  fresh  → one extra set on the first two main lifts that have room (up to 4 sets,
 *           5 for strength); nothing else, so a good day doesn't become a long one
 */
export function applyFeeling(list: PlannedExercise[], feeling: Feeling, style: Style): PlannedExercise[] {
  if (feeling === "tired") {
    return list
      .filter((p) => p.core || p.note)
      .map((p) => {
        const e = getExercise(p.exerciseId);
        if (!e || e.measure === "minutes") return p;
        const trim = e.measure === "seconds" ? 5 : 2;
        return { ...p, sets: Math.max(2, p.sets - 1), max: Math.max(p.min, p.max - trim) };
      });
  }
  if (feeling === "fresh") {
    const cap = style === "strength" ? 5 : 4;
    let given = 0;
    return list.map((p) => {
      const e = getExercise(p.exerciseId);
      if (given >= FRESH_EXTRA_LIFTS || !p.core || !e || e.measure !== "reps" || p.sets >= cap) return p;
      given++;
      return { ...p, sets: p.sets + 1 };
    });
  }
  return list;
}

const range = (p: PlannedExercise) => (p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`);
const nameOf = (id: string) => getExercise(id)?.name ?? id;

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One line saying exactly what the feeling changed, compared with the same workout
 * at "normal", e.g. "Tired: 2 sets instead of 3, 8–10 reps instead of 8–12, skips Plank
 * — about 25 min instead of 35."
 */
export function describeFeeling(feeling: Feeling, normal: PlannedWorkout, felt: PlannedWorkout, opts: { lighterWeights?: boolean } = {}): string {
  if (feeling === "normal") return "Normal: today's workout as planned. Tired makes it shorter and lighter; fresh adds a set to two main lifts.";
  const label = feeling === "tired" ? "Tired" : "Fresh";
  const before = new Map(normal.exercises.map((p) => [p.exerciseId, p]));
  const kept = new Set(felt.exercises.map((p) => p.exerciseId));

  // group identical changes so the line stays short ("2 sets instead of 3")
  const setChanges = new Map<string, string[]>();
  const repChanges = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, name: string) => m.set(k, [...(m.get(k) ?? []), name]);
  for (const p of felt.exercises) {
    const n = before.get(p.exerciseId);
    if (!n) continue;
    if (n.sets !== p.sets) push(setChanges, `${p.sets} sets instead of ${n.sets}`, nameOf(p.exerciseId));
    if (n.min !== p.min || n.max !== p.max) {
      const unit = getExercise(p.exerciseId)?.measure === "seconds" ? "seconds" : "reps";
      push(repChanges, `${range(p)} ${unit} instead of ${range(n)}`, nameOf(p.exerciseId));
    }
  }
  // a change that applies to everything needs no names; a change to some exercises names them
  const phrases = (m: Map<string, string[]>) =>
    [...m].map(([k, names]) => (feeling === "tired" && m.size === 1 ? k : `${k} on ${listNames(names)}`));
  // tired takes one set off every lift; when lifts started at different counts, say that once
  const setPhrases = feeling === "tired" && setChanges.size > 1 ? ["one set fewer on each lift"] : phrases(setChanges);
  const parts = [...setPhrases, ...phrases(repChanges)];

  const dropped = normal.exercises.filter((p) => !kept.has(p.exerciseId)).map((p) => nameOf(p.exerciseId));
  if (dropped.length) parts.push(`skips ${listNames(dropped)}`);
  if (opts.lighterWeights) parts.push("suggested weights about 10% lighter");

  if (parts.length === 0) return `${label}: same as normal today.`;
  const time = felt.minutes !== normal.minutes ? ` — about ${felt.minutes} min instead of ${normal.minutes}` : "";
  return `${label}: ${parts.join(", ")}${time}.`;
}

/** A "not available" replacement: the same slot, with the right sets and reps for the new movement. */
export function swapPlanned(p: PlannedExercise, toId: string, style: Style): PlannedExercise | null {
  const e = getExercise(toId);
  if (!e) return null;
  const s = schemeFor(e, p.core ? "main" : "accessory", style);
  const sets = e.measure === "minutes" ? 1 : Math.max(2, Math.min(p.sets, s.sets + 1));
  return { exerciseId: toId, sets, min: s.min, max: s.max, core: p.core, ...(p.note ? { note: p.note } : {}) };
}

/** The whole rotation for a look, at standard length, for showing "your plan". */
export function planOverview(look: Look): PlannedWorkout[] {
  return WORKOUT_KEYS.map((k) => buildWorkout(look, k, "standard"));
}
