import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, daysBetween, monthGrid, startOfWeek } from "./dates.ts";
import { buildCalendar, fold, isTime, nextWeekday, suggestedDays } from "./ics.ts";
import { THEME_KEY, THEME_SCRIPT, nextThemePref, parseThemePref } from "./theme.ts";

const MON = "2026-10-19"; // a Monday

describe("dates", () => {
  it("weeks start on Monday", () => {
    assert.equal(startOfWeek("2026-10-18"), "2026-10-12");
    assert.equal(startOfWeek(MON), MON);
  });
  it("counts days across a DST change", () => {
    assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
    assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  });
  it("builds a month grid with the right number of weeks", () => {
    const grid = monthGrid(2026, 9);
    assert.equal(grid.length, 5);
    assert.equal(grid[0][0].date, "2026-09-28");
    assert.equal(grid[0][3].inMonth, true);
    assert.equal(grid[0][2].inMonth, false);
  });
});

describe("calendar reminders", () => {
  const NOW = new Date(2026, 9, 20, 9, 30, 0);
  it("builds one weekly event per chosen day, with a 30-minute alarm", () => {
    const ics = buildCalendar({ days: [0, 2, 4], time: "18:00", siteUrl: "https://example.com", now: NOW });
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
    assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO/);
    assert.match(ics, /TRIGGER:-PT30M/);
    assert.match(ics, /DTSTART:20261026T180000/);
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  });
  it("starts today when today is a chosen day and handles an evening past midnight", () => {
    assert.equal(nextWeekday("2026-10-20", 1), "2026-10-20");
    assert.match(buildCalendar({ days: [1], time: "23:30", minutes: 60, siteUrl: "x", now: NOW }), /DTEND:20261020T003000/);
  });
  it("never repeats a day and keeps lines within 75 bytes", () => {
    const ics = buildCalendar({ days: [0, 0], time: "07:15", siteUrl: "https://example.com/" + "a".repeat(200), now: NOW });
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
    for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
    assert.equal(fold("a".repeat(100)).split("\r\n").length, 2);
  });
  it("suggests a spread of days and validates times", () => {
    assert.deepEqual(suggestedDays(3), [0, 2, 4]);
    assert.equal(isTime("18:00"), true);
    assert.equal(isTime("25:00"), false);
  });
});

describe("theme preference", () => {
  it("reads only light or dark; anything else means follow the system", () => {
    assert.equal(parseThemePref("light"), "light");
    assert.equal(parseThemePref("dark"), "dark");
    assert.equal(parseThemePref(null), "system");
    assert.equal(parseThemePref("purple"), "system");
  });
  it("the header button cycles system, light, dark", () => {
    assert.deepEqual([nextThemePref("system"), nextThemePref("light"), nextThemePref("dark")], ["light", "dark", "system"]);
  });
  it("the before-paint script reads the same storage key and is wrapped in try/catch", () => {
    assert.ok(THEME_SCRIPT.includes(JSON.stringify(THEME_KEY)));
    assert.match(THEME_SCRIPT, /try\{.*\}catch\(e\)\{\}/);
  });
});
