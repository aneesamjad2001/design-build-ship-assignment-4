import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXERCISES, getExercise } from "./library.ts";
import { LOOKS, getLook } from "./looks.ts";
import { TIME_OPTIONS, WORKOUT_KEYS, buildWorkout, describeFeeling, planOverview, reentry } from "./workouts.ts";
import type { BuildContext } from "./workouts.ts";

const look = (id: string) => getLook(id)!;
const ids = (w: ReturnType<typeof buildWorkout>) => w.exercises.map((e) => e.exerciseId);

describe("library", () => {
  it("has 25 exercises, each with swaps that exist and no self-swaps", () => {
    assert.equal(EXERCISES.length, 25);
    for (const e of EXERCISES) {
      for (const s of e.swaps) {
        assert.ok(getExercise(s), `${e.id} swaps to unknown ${s}`);
        assert.notEqual(s, e.id);
      }
    }
  });
  it("has unique ids", () => {
    assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  });
});

describe("every look builds sane workouts", () => {
  for (const l of LOOKS) {
    for (const key of WORKOUT_KEYS) {
      for (const time of TIME_OPTIONS) {
        it(`${l.id} · ${key} · ${time}`, () => {
          const w = buildWorkout(l, key, time);
          assert.ok(w.exercises.length >= 4, "at least four exercises");
          assert.equal(new Set(ids(w)).size, w.exercises.length, "no duplicate exercises");
          for (const e of w.exercises) {
            assert.ok(getExercise(e.exerciseId), "known exercise");
            assert.ok(e.sets >= 1 && e.sets <= 5);
            assert.ok(e.min >= 1 && e.max >= e.min);
          }
          assert.ok(w.minutes >= 10 && w.minutes <= 120, `minutes ${w.minutes}`);
        });
      }
    }
  }
});

describe("time options", () => {
  it("short keeps only the essentials at two sets; long adds extras", () => {
    const l = look("broad-muscular");
    const short = buildWorkout(l, "A", "short");
    const standard = buildWorkout(l, "A", "standard");
    const long = buildWorkout(l, "A", "long");
    assert.ok(short.exercises.every((e) => e.core && e.sets <= 2));
    assert.ok(short.exercises.length < standard.exercises.length);
    assert.ok(standard.exercises.length < long.exercises.length);
    assert.ok(short.minutes < standard.minutes && standard.minutes < long.minutes);
  });
  it("every workout is full-body: it always has a squat/hinge move, a push and a pull", () => {
    for (const l of LOOKS) for (const k of WORKOUT_KEYS) {
      const patterns = new Set(buildWorkout(l, k, "short").exercises.map((e) => getExercise(e.exerciseId)!.pattern));
      assert.ok(patterns.has("squat") || patterns.has("hinge"), `${l.id} ${k} lower`);
      assert.ok([...patterns].some((p) => p.startsWith("push")), `${l.id} ${k} push`);
      assert.ok([...patterns].some((p) => p.startsWith("pull")), `${l.id} ${k} pull`);
    }
  });
});

describe("looks change the plan", () => {
  it("'strength' uses heavier, lower-rep main lifts than 'tone'", () => {
    const strong = buildWorkout(look("big-strong"), "A", "standard").exercises[1];
    const tone = buildWorkout(look("toned-defined"), "A", "standard").exercises[1];
    assert.ok(strong.max < tone.min + 1 || strong.max <= 8);
    assert.ok(tone.min >= 12);
    assert.ok(strong.sets >= 4);
  });
  it("looks with a cardio finisher get one on standard and long, never on short", () => {
    const l = look("lean-athletic");
    assert.ok(ids(buildWorkout(l, "A", "standard")).includes("incline-walk"));
    assert.ok(ids(buildWorkout(l, "A", "long")).includes("incline-walk"));
    assert.ok(!ids(buildWorkout(l, "A", "short")).includes("incline-walk"));
    assert.ok(!ids(buildWorkout(look("broad-muscular"), "A", "long")).includes("incline-walk"));
  });
  it("emphasised looks give extra sets to the movements that train what they're built around", () => {
    const glutes = buildWorkout(look("legs-glutes"), "B", "standard").exercises.find((e) => e.exerciseId === "hip-thrust")!;
    const balanced = buildWorkout(look("balanced"), "B", "standard").exercises.find((e) => e.exerciseId === "hip-thrust")!;
    assert.ok(glutes.sets > balanced.sets);
  });
  it("different looks pick different extras, and the three workouts differ", () => {
    const a = ids(buildWorkout(look("broad-muscular"), "A", "long")).join();
    const b = ids(buildWorkout(look("legs-glutes"), "A", "long")).join();
    assert.notEqual(a, b);
    const overview = planOverview(look("balanced")).map((w) => ids(w).join());
    assert.equal(new Set(overview).size, 3);
  });
});

describe("adjustments", () => {
  const l = look("balanced");
  it("the first workout is a light intro: two sets, no extras, no finisher", () => {
    const w = buildWorkout(look("lean-athletic"), "A", "long", { intro: true });
    assert.ok(w.exercises.every((e) => e.sets <= 2));
    assert.ok(!ids(w).includes("incline-walk"));
    assert.ok(w.notes.some((n) => /intro/i.test(n)));
  });
  it("re-entry scales with time away and is silent under two weeks", () => {
    assert.equal(reentry(3).note, null);
    assert.equal(reentry(13).note, null);
    assert.equal(reentry(null).note, null);
    assert.match(reentry(15).note!, /2 weeks/);
    assert.match(reentry(30).note!, /4 weeks/);
    assert.ok(reentry(15).weightFactor > reentry(30).weightFactor && reentry(30).weightFactor > reentry(70).weightFactor);
    const normal = buildWorkout(l, "A", "standard", { daysAway: 3 });
    const back = buildWorkout(l, "A", "standard", { daysAway: 40 });
    assert.ok(back.exercises.every((e) => e.sets === 2 || getExercise(e.exerciseId)!.measure === "minutes"));
    assert.ok(normal.exercises.some((e) => e.sets === 3));
    assert.ok(back.notes.some((n) => /easing in/i.test(n)));
  });
  it("tired means shorter and lighter: fewer sets, fewer reps, no extras", () => {
    const normal = buildWorkout(l, "A", "standard");
    const tired = buildWorkout(l, "A", "standard", { feeling: "tired" });
    assert.ok(tired.exercises.length < normal.exercises.length);
    assert.ok(tired.minutes < normal.minutes);
    const squat = (w: typeof normal) => w.exercises.find((e) => e.exerciseId === "goblet-squat")!;
    assert.deepEqual([squat(normal).sets, squat(normal).min, squat(normal).max], [3, 8, 12]);
    assert.deepEqual([squat(tired).sets, squat(tired).min, squat(tired).max], [2, 8, 10]);
  });
  it("skipped exercises come back as labelled make-ups, but not in a short session", () => {
    const w = buildWorkout(l, "B", "standard", { makeUps: ["leg-curl"] });
    assert.equal(w.exercises.find((e) => e.exerciseId === "leg-curl")?.note, "Skipped last time");
    assert.ok(!ids(buildWorkout(l, "B", "short", { makeUps: ["leg-curl"] })).includes("leg-curl"));
  });
  it("a swap replaces the exercise in place", () => {
    const w = buildWorkout(l, "A", "standard", { swaps: { "goblet-squat": "leg-press" } });
    assert.equal(w.exercises[0].exerciseId, "leg-press");
  });
});

describe("how are you feeling?", () => {
  const sig = (w: ReturnType<typeof buildWorkout>) => w.exercises.map((e) => `${e.exerciseId}:${e.sets}:${e.min}-${e.max}`).join();
  const totalSets = (w: ReturnType<typeof buildWorkout>) => w.exercises.reduce((n, e) => n + e.sets, 0);
  const volume = (w: ReturnType<typeof buildWorkout>) => w.exercises.reduce((n, e) => n + e.sets * e.max, 0);
  const situations: [string, BuildContext][] = [
    ["first workout", { intro: true }],
    ["regular", { daysAway: 3 }],
    ["back after 6 weeks", { daysAway: 42 }],
  ];

  for (const [label, ctx] of situations) {
    it(`every answer visibly changes the workout (${label}, every look, workout and length)`, () => {
      for (const l of LOOKS) for (const k of WORKOUT_KEYS) for (const t of TIME_OPTIONS) {
        const normal = buildWorkout(l, k, t, { ...ctx, feeling: "normal" });
        const tired = buildWorkout(l, k, t, { ...ctx, feeling: "tired" });
        const fresh = buildWorkout(l, k, t, { ...ctx, feeling: "fresh" });
        const where = `${l.id} ${k} ${t}`;
        assert.notEqual(sig(tired), sig(normal), `tired changes ${where}`);
        assert.notEqual(sig(fresh), sig(normal), `fresh changes ${where}`);
        assert.ok(volume(tired) < volume(normal) && totalSets(tired) <= totalSets(normal) && tired.minutes <= normal.minutes, `tired is less ${where}`);
        assert.ok(totalSets(fresh) > totalSets(normal), `fresh is more ${where}`);
        // fresh stays within the chosen length: at most two extra sets, same exercises
        assert.ok(totalSets(fresh) - totalSets(normal) <= 2, `fresh is only a bit more ${where}`);
        assert.equal(ids(fresh).join(), ids(normal).join());
        assert.ok(fresh.minutes - normal.minutes <= 5, `fresh adds at most ~5 min ${where}`);
        for (const e of fresh.exercises) assert.ok(e.sets <= (l.style === "strength" ? 5 : 4), `fresh cap ${where}`);
        for (const e of tired.exercises) assert.ok(e.sets >= 1 && e.max >= e.min, `tired stays sane ${where}`);
      }
    });
  }

  it("the first workout: tired trims the reps and drops the extra core move", () => {
    const l = look("balanced");
    const normal = buildWorkout(l, "A", "standard", { intro: true });
    const tired = buildWorkout(l, "A", "standard", { intro: true, feeling: "tired" });
    assert.ok(ids(normal).includes("plank") && !ids(tired).includes("plank"));
    assert.ok(tired.exercises.every((e) => e.sets === 2));
    assert.equal(tired.exercises[0].max, normal.exercises[0].max - 2);
  });

  it("says exactly what changed, compared with normal", () => {
    const l = look("balanced");
    const normal = buildWorkout(l, "A", "standard");
    const tired = buildWorkout(l, "A", "standard", { feeling: "tired" });
    const fresh = buildWorkout(l, "A", "standard", { feeling: "fresh" });
    const t = describeFeeling("tired", normal, tired, { lighterWeights: true });
    assert.match(t, /^Tired: 2 sets instead of 3/);
    assert.match(t, /8–10 reps instead of 8–12/);
    assert.match(t, /skips Plank/);
    assert.match(t, /weights about 10% lighter/);
    assert.match(t, new RegExp(`about ${tired.minutes} min instead of ${normal.minutes}`));
    const f = describeFeeling("fresh", normal, fresh);
    assert.match(f, /^Fresh: 4 sets instead of 3 on Goblet squat and Dumbbell bench press/);
    assert.match(describeFeeling("normal", normal, normal), /^Normal:/);
  });
});
