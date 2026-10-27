import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SAVED_NOTE, parseSaved, savedFrom, savedRow, validateNote } from "./saved.ts";
import type { WgerExercise } from "./wger.ts";

const ex: WgerExercise = {
  id: 43, name: " Barbell Hack Squats ", description: "", category: "Legs",
  muscles: ["Quads"], musclesSecondary: ["Glutes"], equipment: ["Barbell"],
  imageUrl: "https://wger.de/media/exercise-images/43/hack.png", license: "CC-BY-SA 3", author: "someone",
};
const T = Date.parse("2026-10-26T18:00:00.000Z");

describe("saved exercises", () => {
  it("keep what the list shows, trimmed", () => {
    const s = savedFrom(ex, T);
    assert.deepEqual(s, { wgerId: 43, name: "Barbell Hack Squats", muscles: ["Quads"], equipment: ["Barbell"], imageUrl: ex.imageUrl, note: "", savedAt: T });
  });
  it("round-trip through a row, without a user_id", () => {
    const row = savedRow({ ...savedFrom(ex, T), note: "seat at 4" });
    assert.equal("user_id" in row, false);
    assert.deepEqual(parseSaved([row]).saved, [{ ...savedFrom(ex, T), note: "seat at 4" }]);
  });
  it("only keep images from wger itself", () => {
    assert.equal(savedFrom({ ...ex, imageUrl: "http://wger.de/x.png" }, T).imageUrl, null);
    assert.equal(parseSaved([{ ...savedRow(savedFrom(ex, T)), image_url: "https://evil.example/x.png" }]).saved[0].imageUrl, null);
  });
  it("drop malformed rows and count them", () => {
    const r = parseSaved([null, { wger_id: "43", name: "x" }, { wger_id: 0, name: "x" }, { wger_id: 5, name: "  " }, savedRow(savedFrom(ex, T))]);
    assert.equal(r.saved.length, 1);
    assert.equal(r.dropped, 4);
  });
  it("list newest first", () => {
    const r = parseSaved([savedRow(savedFrom(ex, T)), savedRow(savedFrom({ ...ex, id: 44 }, T + 1000))]);
    assert.deepEqual(r.saved.map((s) => s.wgerId), [44, 43]);
  });
  it("only accept tags that are text", () => {
    assert.deepEqual(parseSaved([{ ...savedRow(savedFrom(ex, T)), muscles: ["Quads", 3, null, " "] }]).saved[0].muscles, ["Quads"]);
  });
});

describe("a note on a saved exercise", () => {
  it("is trimmed, and an empty note clears it", () => {
    assert.deepEqual(validateNote("  use the 20s  "), { note: "use the 20s" });
    assert.deepEqual(validateNote("   "), { note: "" });
  });
  it("says how long it is when it's too long", () => {
    const r = validateNote("x".repeat(MAX_SAVED_NOTE + 5));
    assert.ok("error" in r && r.error.includes(String(MAX_SAVED_NOTE + 5)));
  });
});
