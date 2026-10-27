"use client";

import { useState } from "react";
import { Button } from "./Button";
import { monthGrid, monthName, parseDate } from "@/lib/dates";

/** A month grid of the days someone trained. A real table, so a screen reader
 *  hears "Tuesday 14, trained" rather than a pile of colored squares. */
export function Calendar({ trained, today }: { trained: Set<string>; today: string }) {
  const t = parseDate(today);
  const [view, setView] = useState({ year: t.getFullYear(), month: t.getMonth() });
  const atCurrent = view.year === t.getFullYear() && view.month === t.getMonth();

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const weeks = monthGrid(view.year, view.month);
  const trainedThisMonth = weeks.flat().filter((c) => c.inMonth && trained.has(c.date)).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => shift(-1)} aria-label="Previous month" className="!min-h-11 !px-4">
          ←
        </Button>
        <h3 className="text-center font-display text-3xl font-extrabold" aria-live="polite">
          {monthName(view.month)} {view.year}
          <span className="block font-body text-base font-normal text-muted">
            {trainedThisMonth} {trainedThisMonth === 1 ? "day" : "days"} trained
          </span>
        </h3>
        <Button variant="secondary" onClick={() => shift(1)} disabled={atCurrent} aria-label="Next month" className="!min-h-11 !px-4">
          →
        </Button>
      </div>
      <table className="w-full table-fixed border-collapse text-center">
        <caption className="sr-only">
          Days you trained in {monthName(view.month)} {view.year}
        </caption>
        <thead>
          <tr>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <th key={d} scope="col" className="pb-2 text-sm font-semibold text-muted">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((c) => {
                const did = trained.has(c.date);
                const isToday = c.date === today;
                const dayNum = parseDate(c.date).getDate();
                return (
                  <td key={c.date} className="p-0.5">
                    <div
                      className={`mx-auto flex h-11 w-full max-w-11 items-center justify-center font-stencil text-xl font-bold ${
                        !c.inMonth
                          ? "text-line"
                          : did
                            ? "bg-ink text-on-ink"
                            : isToday
                              ? "border-2 border-ink text-ink"
                              : "text-muted"
                      }`}
                    >
                      <span aria-hidden={!c.inMonth}>{c.inMonth ? dayNum : ""}</span>
                      {c.inMonth && (
                        <span className="sr-only">
                          {did ? ", trained" : isToday ? ", today" : ""}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
