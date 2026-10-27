/** A calendar file (.ics) with a weekly training reminder. Ironlog doesn't send
 *  notifications itself, but any calendar app can, and this
 *  gives it the schedule. Times are "floating": they mean local time wherever you are. */

import { addDays, parseDate, toDateString } from "./dates.ts";

/** Monday-first, matching the rest of the app. */
export const WEEKDAYS = [
  { code: "MO", label: "Mon", long: "Monday" },
  { code: "TU", label: "Tue", long: "Tuesday" },
  { code: "WE", label: "Wed", long: "Wednesday" },
  { code: "TH", label: "Thu", long: "Thursday" },
  { code: "FR", label: "Fri", long: "Friday" },
  { code: "SA", label: "Sat", long: "Saturday" },
  { code: "SU", label: "Sun", long: "Sunday" },
] as const;

/** A sensible spread of training days for N days a week (Monday = 0). */
export function suggestedDays(perWeek: number): number[] {
  const spread: Record<number, number[]> = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 3, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };
  return spread[Math.min(6, Math.max(2, perWeek))];
}

export function isTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** RFC 5545: lines are at most 75 octets; continuation lines start with a space. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose a byte to the leading space
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

/** The first date on or after `from` that falls on weekday `day` (Monday = 0). */
export function nextWeekday(from: string, day: number): string {
  const offset = (day - ((parseDate(from).getDay() + 6) % 7) + 7) % 7;
  return addDays(from, offset);
}

export function buildCalendar(opts: { days: number[]; time: string; minutes?: number; siteUrl: string; now?: Date }): string {
  const { days, time, siteUrl, minutes = 60 } = opts;
  const now = opts.now ?? new Date();
  const today = toDateString(now);
  const [hh, mm] = time.split(":").map(Number);
  const endTotal = hh * 60 + mm + minutes;
  const end = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}${String(endTotal % 60).padStart(2, "0")}00`;

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ironlog//Training reminders//EN", "CALSCALE:GREGORIAN"];
  for (const day of [...new Set(days)].sort((a, b) => a - b)) {
    const date = nextWeekday(today, day).replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:ironlog-${WEEKDAYS[day].code}-${time.replace(":", "")}@ironlog`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${date}T${time.replace(":", "")}00`,
      `DTEND:${date}T${end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${WEEKDAYS[day].code}`,
      "SUMMARY:Ironlog workout",
      `DESCRIPTION:${escapeText(`Open Ironlog to see today's workout and log it: ${siteUrl}`)}`,
      `URL:${siteUrl}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Time to train",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
