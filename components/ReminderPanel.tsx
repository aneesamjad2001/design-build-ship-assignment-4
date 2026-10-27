"use client";

import { useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Field, FieldError, Input } from "./Field";
import { WEEKDAYS, buildCalendar, isTime, suggestedDays } from "@/lib/ics";

const tile =
  "group flex min-h-12 cursor-pointer items-center justify-center border-2 border-field bg-surface px-1 text-lg font-semibold transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-on-ink has-[:focus-visible]:transition-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

/**
 * Ironlog has no server, so it can't push notifications. Your calendar can: this
 * hands it a weekly schedule with an alert 30 minutes before.
 */
export function ReminderPanel({ perWeek }: { perWeek: number }) {
  const [days, setDays] = useState<number[]>(() => suggestedDays(perWeek));
  const [time, setTime] = useState("18:00");
  const [errors, setErrors] = useState<{ days?: string; time?: string }>({});
  const [done, setDone] = useState(false);

  function download() {
    const next: typeof errors = {};
    if (days.length === 0) next.days = "Pick at least one day to train.";
    if (!isTime(time)) next.time = "Enter a time like 18:00.";
    setErrors(next);
    if (next.days || next.time) {
      setDone(false);
      return;
    }
    const ics = buildCalendar({ days, time, siteUrl: window.location.origin + "/" });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ironlog-training.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDone(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset aria-describedby={errors.days ? "reminder-days-error" : undefined}>
        <legend className="mb-2 text-base font-semibold">Training days</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <label key={d.code} className={tile}>
              <input
                type="checkbox"
                className="sr-only"
                checked={days.includes(i)}
                onChange={(e) => {
                  setDays(e.target.checked ? [...days, i] : days.filter((x) => x !== i));
                  setErrors((prev) => ({ ...prev, days: undefined }));
                  setDone(false);
                }}
              />
              <span aria-hidden>{d.label}</span>
              <span className="sr-only">{d.long}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">Your plan has {perWeek} days a week.</p>
        {errors.days && (
          <div className="mt-2">
            <FieldError id="reminder-days-error">{errors.days}</FieldError>
          </div>
        )}
      </fieldset>

      <Field id="reminder-time" label="Time of day" error={errors.time}>
        {(p) => (
          <Input
            {...p}
            type="time"
            value={time}
            invalid={!!errors.time}
            className="max-w-48"
            onChange={(e) => {
              setTime(e.target.value);
              setErrors((prev) => ({ ...prev, time: undefined }));
              setDone(false);
            }}
          />
        )}
      </Field>

      <div>
        <Button variant="secondary" onClick={download}>
          Download calendar file
        </Button>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Open the .ics file to add a repeating workout to Apple, Google or Outlook Calendar, with an alert 30 minutes before. Ironlog can&apos;t send
          reminders itself — it has no server — so your calendar does the reminding.
        </p>
      </div>
      {done && <Banner tone="success" title="Calendar file downloaded">Open it to add your weekly workouts.</Banner>}
    </div>
  );
}
