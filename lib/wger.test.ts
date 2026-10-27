import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browseUrl, matchName, parseBrowse, parseExercise, parseFilters, toPlainText } from "./wger.ts";

// Shaped like a real exerciseinfo result, cut down.
const RAW = {
  id: 43,
  category: { id: 9, name: "Legs" },
  muscles: [{ id: 10, name: "Quadriceps femoris", name_en: "Quads" }],
  muscles_secondary: [{ id: 8, name: "Gluteus maximus", name_en: "" }],
  equipment: [{ id: 1, name: "Barbell" }],
  license: { short_name: "CC-BY-SA 3" },
  license_author: "wger.de",
  images: [{ image: "https://wger.de/media/exercise-images/43/hack.png", is_main: true }],
  translations: [
    { language: 1, name: "Hackenschmidt", description: "<p>Deutsch</p>" },
    { language: 2, name: " Barbell Hack Squats ", description: "<p>Hold the bar &amp; squat.</p><ol><li>Down</li><li>Up</li></ol>", license_author: "someone" },
  ],
};

describe("wger: one exercise", () => {
  it("keeps the English name and the fields the card needs", () => {
    const e = parseExercise(RAW)!;
    assert.equal(e.id, 43);
    assert.equal(e.name, "Barbell Hack Squats");
    assert.deepEqual(e.muscles, ["Quads"]);
    assert.deepEqual(e.musclesSecondary, ["Gluteus maximus"], "falls back to the Latin name when name_en is empty");
    assert.deepEqual(e.equipment, ["Barbell"]);
    assert.equal(e.author, "someone");
    assert.equal(e.license, "CC-BY-SA 3");
    assert.equal(e.description, "Hold the bar & squat.\n\n• Down\n• Up");
  });
  it("skips exercises with no English translation", () => {
    assert.equal(parseExercise({ ...RAW, translations: [RAW.translations[0]] }), null);
    assert.equal(parseExercise({ ...RAW, translations: [{ language: 2, name: "  " }] }), null);
  });
  it("never trusts the shape", () => {
    for (const bad of [null, 1, "x", [], {}, { id: "43" }, { id: 1.5 }]) assert.equal(parseExercise(bad), null);
  });
  it("only shows https images from wger itself", () => {
    const img = (image: string) => parseExercise({ ...RAW, images: [{ image }] })!.imageUrl;
    assert.equal(img("http://wger.de/a.png"), null);
    assert.equal(img("https://evil.example/a.png"), null);
    assert.equal(img("javascript:alert(1)"), null);
    assert.equal(parseExercise({ ...RAW, images: [] })!.imageUrl, null);
  });
});

describe("wger: descriptions are plain text", () => {
  it("drops every tag, including scripts and handlers", () => {
    const t = toPlainText('<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    assert.equal(t, "Hi");
  });
  it("cannot be tricked into producing a tag with entities", () => {
    const t = toPlainText("&lt;img src=x onerror=alert(1)&gt; &#60;b&#62;");
    assert.ok(!t.includes("<") && !t.includes(">"), t);
  });
  it("keeps each list item's text on its bullet's line", () => {
    const t = toPlainText("<ol>\n<li>\n<p>Lie on the bench.</p>\n</li>\n<li><p>Press up.</p></li>\n</ol>");
    assert.equal(t, "• Lie on the bench.\n\n• Press up.");
  });
});

describe("wger: filters", () => {
  const f = (q: string) => parseFilters(new URLSearchParams(q));
  it("accepts known muscle and equipment ids", () => {
    assert.deepEqual(f("muscle=10"), { muscle: 10, equipment: null });
    assert.deepEqual(f("muscle=10&equipment=1"), { muscle: 10, equipment: 1 });
    assert.deepEqual(f("equipment=7"), { muscle: null, equipment: 7 });
  });
  it("refuses unknown ids and empty browsing (which would fetch all 932)", () => {
    for (const q of ["", "muscle=99", "muscle=abc", "equipment=0", "muscle=10&equipment=99", "muscle=1e1"]) assert.equal(f(q), null, q);
  });
  it("builds the wger URL from ids only", () => {
    assert.equal(browseUrl({ muscle: 10, equipment: 1 }), "https://wger.de/api/v2/exerciseinfo/?language=2&limit=100&muscles=10&equipment=1");
  });
});

describe("wger: a page of results", () => {
  it("reads nothing found as an empty list, not an error", () => {
    assert.deepEqual(parseBrowse({ count: 0, next: null, results: [] }), { exercises: [], total: 0 });
  });
  it("rejects a response that isn't a page", () => {
    assert.equal(parseBrowse({ detail: "Not found." }), null);
  });
  it("sorts by name and narrows by every word", () => {
    const page = parseBrowse({ count: 2, results: [RAW, { ...RAW, id: 9, translations: [{ language: 2, name: "Air Squat" }] }] })!;
    assert.deepEqual(page.exercises.map((e) => e.name), ["Air Squat", "Barbell Hack Squats"]);
    assert.deepEqual(matchName(page.exercises, "  SQUAT hack ").map((e) => e.id), [43]);
    assert.equal(matchName(page.exercises, "").length, 2);
    assert.equal(matchName(page.exercises, "deadlift").length, 0);
  });
});
