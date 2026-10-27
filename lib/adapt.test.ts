import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "./dates.ts";
import { completion, nextWeight, nextWorkout, recentCount, suggestedWeight, updateBook, weightStep } from "./adapt.ts";
import type { CompletedWorkout, WeightBook } from "./adapt.ts";
import { getExercise } from "./library.ts";

const TODAY = "2026-10-20";
let n = 0;
const done = (daysAgo: number, key: "A" | "B" | "C", setsDone: number, setsPlanned = 3, extra: Partial<CompletedWorkout["exercises"][number]> = {}): CompletedWorkout => ({
  id: `w${n++}`,
  date: addDays(TODAY, -daysAgo),
  key,
  unit: "lb",
  createdAt: n,
  exercises: [{ exerciseId: "goblet-squat", setsDone, setsPlanned, weight: 40, ...extra }],
});

describe("next workout", () => {
  it("starts new people at Workout A as a light intro", () => {
    const r = nextWorkout([], TODAY);
    assert.deepEqual([r.key, r.isFirst, r.daysAway], ["A", true, null]);
  });
  it("moves along A → B → C → A, however long it has been", () => {
    assert.equal(nextWorkout([done(3, "A", 3)], TODAY).key, "B");
    assert.equal(nextWorkout([done(3, "C", 3)], TODAY).key, "A");
    const after3Weeks = nextWorkout([done(21, "B", 3)], TODAY);
    assert.equal(after3Weeks.key, "C"); // no catching up, no debt
    assert.equal(after3Weeks.daysAway, 21);
  });
  it("repeats a workout that was mostly unfinished", () => {
    const r = nextWorkout([done(2, "B", 1, 3)], TODAY);
    assert.equal(r.key, "B");
    assert.equal(r.repeat, true);
    assert.match(r.reason, /finish it/);
  });
  it("queues skipped exercises as make-ups when it moves on", () => {
    const w = done(2, "A", 3);
    w.exercises.push({ exerciseId: "leg-curl", setsDone: 0, setsPlanned: 3, weight: null, skipped: true });
    const r = nextWorkout([w], TODAY);
    assert.deepEqual(r.makeUps, ["leg-curl"]);
  });
  it("uses the most recent workout, not the last one saved", () => {
    const older = { ...done(10, "A", 3), createdAt: 999 };
    const newer = done(2, "B", 3);
    assert.equal(nextWorkout([older, newer], TODAY).key, "C");
  });
  it("counts completion", () => {
    assert.equal(completion(done(1, "A", 3, 3)), 1);
    assert.equal(completion(done(1, "A", 0, 3)), 0);
    assert.ok(Math.abs(completion(done(1, "A", 1, 3)) - 1 / 3) < 1e-9);
  });
});

describe("weights", () => {
  const squat = getExercise("leg-press")!;
  const curl = getExercise("dumbbell-curl")!;
  const press = getExercise("dumbbell-bench-press")!;

  it("steps differ by kind of exercise and unit", () => {
    assert.equal(weightStep(squat, "lb"), 10);
    assert.equal(weightStep(press, "lb"), 5);
    assert.equal(weightStep(curl, "lb"), 2.5);
    assert.equal(weightStep(press, "kg"), 2.5);
  });
  it("easy goes up a step, hard drops about 10%, right holds then goes up after two", () => {
    assert.equal(nextWeight(press, 40, "easy", undefined, "lb", TODAY).weight, 45);
    assert.equal(nextWeight(press, 40, "hard", undefined, "lb", TODAY).weight, 35);
    const first = nextWeight(press, 40, "right", undefined, "lb", TODAY);
    assert.deepEqual([first.weight, first.rightStreak], [40, 1]);
    const second = nextWeight(press, 40, "right", first, "lb", TODAY);
    assert.deepEqual([second.weight, second.rightStreak], [45, 0]);
  });
  it("no feedback counts as 'just right'", () => {
    assert.equal(nextWeight(press, 40, undefined, undefined, "lb", TODAY).rightStreak, 1);
  });
  it("never goes below zero", () => {
    assert.equal(nextWeight(curl, 2.5, "hard", undefined, "lb", TODAY).weight >= 0, true);
  });
  it("suggests the remembered weight, eased down after time away", () => {
    const book: WeightBook = { "dumbbell-bench-press": { weight: 40, unit: "lb", rightStreak: 0, updatedAt: TODAY } };
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 3, "lb"), 40);
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 20, "lb"), 35); // 90% rounded to a 5 lb step
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 40, "lb"), 30);
    assert.equal(suggestedWeight("push-up", book, 3, "lb"), null); // bodyweight
    assert.equal(suggestedWeight("hip-thrust", book, 3, "lb"), null); // never done
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 3, "kg"), null); // other unit: ask again
  });
  it("suggests a lighter weight on a tired day, at least one step down; fresh and normal don't change it", () => {
    const book: WeightBook = { "dumbbell-bench-press": { weight: 40, unit: "lb", rightStreak: 0, updatedAt: TODAY } };
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 3, "lb", "tired"), 35);
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 3, "lb", "fresh"), 40);
    assert.equal(suggestedWeight("dumbbell-bench-press", book, 3, "lb", "normal"), 40);
    assert.ok(suggestedWeight("dumbbell-bench-press", book, 40, "lb", "tired")! < suggestedWeight("dumbbell-bench-press", book, 40, "lb")!);
  });
  it("folds a finished workout into the book, ignoring skipped and unweighted work", () => {
    const w = done(0, "A", 3, 3, { exerciseId: "dumbbell-bench-press", weight: 40, feedback: "easy" });
    w.exercises.push({ exerciseId: "push-up", setsDone: 3, setsPlanned: 3, weight: null });
    w.exercises.push({ exerciseId: "leg-curl", setsDone: 0, setsPlanned: 3, weight: 50, skipped: true });
    const book = updateBook({}, w);
    assert.equal(book["dumbbell-bench-press"].weight, 45);
    assert.equal(book["push-up"], undefined);
    assert.equal(book["leg-curl"], undefined);
  });
  it("counts recent workouts", () => {
    const ws = [done(1, "A", 3), done(10, "B", 3), done(40, "C", 3)];
    assert.equal(recentCount(ws, TODAY, 28), 2);
  });
});
