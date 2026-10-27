import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_DATA } from "./data.ts";
import type { Data } from "./data.ts";
import { checkinRow, fromRows, profileRow, workoutRow } from "./rows.ts";
import type { CheckinRow, ProfileRow, WorkoutRow } from "./rows.ts";

const T = "2026-10-19T18:00:00.000Z";
const profile: ProfileRow = {
  look_id: "balanced", time: "standard", unit: "lb",
  weights: { "goblet-squat": { weight: 40, unit: "lb", rightStreak: 1, updatedAt: "2026-10-19" } },
  nutrition: null, created_at: T,
};
const workout: WorkoutRow = {
  id: "5d3c1c0e-9a8b-4f6e-8d7c-1b2a3c4d5e6f", date: "2026-10-19", key: "A", unit: "lb", note: "", created_at: T,
  exercises: [{ exerciseId: "goblet-squat", setsDone: 3, setsPlanned: 3, weight: 40, feedback: "right" }],
};
const checkin: CheckinRow = { id: "0b8f1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d", date: "2026-10-01", answers: { unit: "lb", weight: 180, waist: 34 }, created_at: T };

describe("rows from Supabase", () => {
  it("become the app's data, through the same validators as a backup", () => {
    const { data, recovered } = fromRows(profile, [workout], [checkin]);
    assert.equal(recovered, false);
    assert.deepEqual(data.profile, { lookId: "balanced", time: "standard", unit: "lb", createdAt: Date.parse(T) });
    assert.equal(data.workouts.length, 1);
    assert.equal(data.workouts[0].note, undefined);
    assert.equal(data.weights["goblet-squat"].weight, 40);
    assert.deepEqual(data.checkins[0], { id: checkin.id, date: "2026-10-01", unit: "lb", weight: 180, waist: 34, createdAt: Date.parse(T) });
  });
  it("no profile row is a first visit", () => {
    assert.deepEqual(fromRows(null, [], []), { data: EMPTY_DATA, recovered: false });
  });
  it("drops and reports bad jsonb instead of trusting it", () => {
    const r = fromRows(
      { ...profile, weights: { "not-an-exercise": { weight: 1 } }, nutrition: { age: 12 } },
      [{ ...workout, exercises: "nope" }, { ...workout, key: "Z" }],
      [{ ...checkin, answers: { weight: -5 } }],
    );
    assert.equal(r.recovered, true);
    assert.deepEqual(r.data.workouts, []);
    assert.deepEqual(r.data.weights, {});
    assert.equal(r.data.nutrition, null);
    assert.deepEqual(r.data.checkins, []);
  });
  it("a check-in's answers can't override its row id or date", () => {
    const r = fromRows(profile, [], [{ ...checkin, answers: { id: "x", date: "1999-01-01", weight: 180 } }]);
    assert.equal(r.data.checkins[0].id, checkin.id);
    assert.equal(r.data.checkins[0].date, "2026-10-01");
  });
});

describe("rows to Supabase", () => {
  const data: Data = fromRows(profile, [workout], [checkin]).data;
  it("never carry a user_id: the database takes it from the session token", () => {
    for (const row of [profileRow(data), workoutRow(data.workouts[0]), checkinRow(data.checkins[0])]) {
      assert.ok(row && !("user_id" in row));
    }
  });
  it("round-trip", () => {
    const p = profileRow(data)!;
    const back = fromRows({ ...p, created_at: T }, [{ ...workoutRow(data.workouts[0]), created_at: T }], [{ ...checkinRow(data.checkins[0]), created_at: T }]);
    assert.deepEqual(back.data, data);
  });
  it("always carry created_at, so a bulk upsert never sends null for it", () => {
    assert.equal(workoutRow({ ...data.workouts[0], createdAt: 0 }).created_at, "2026-10-19T12:00:00.000Z");
    assert.equal(checkinRow({ ...data.checkins[0], createdAt: 0 }).created_at, "2026-10-01T12:00:00.000Z");
  });
  it("no profile means nothing to save", () => {
    assert.equal(profileRow(EMPTY_DATA), null);
  });
});
