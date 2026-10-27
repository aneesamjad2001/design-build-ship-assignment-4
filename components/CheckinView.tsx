"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { Field, Input } from "./Field";
import { LoadingState, NeedsProfile } from "./States";
import { CHECKIN_FIELDS, unitFor, validateCheckin } from "@/lib/checkin";
import type { Checkin, CheckinErrors, CheckinForm } from "@/lib/checkin";
import type { Unit } from "@/lib/adapt";
import { fmtWeight } from "@/lib/data";
import { shortDate } from "@/lib/dates";
import { addCheckin, deleteCheckin, restoreCheckin, useIronlog, useToday } from "@/lib/store";

export function CheckinView() {
  const snap = useIronlog();
  const today = useToday();
  if (!snap.ready || !today) return <LoadingState />;
  if (!snap.data.profile) return <NeedsProfile what="Check-ins track your body's trend over time." />;
  return <CheckinPage unit={snap.data.profile.unit} checkins={snap.data.checkins} today={today} />;
}

const empty = (date: string): CheckinForm => ({ date, weight: "", waist: "", chest: "", hips: "", arm: "" });

function CheckinPage({ unit, checkins, today }: { unit: Unit; checkins: Checkin[]; today: string }) {
  const [form, setForm] = useState<CheckinForm>(() => empty(today));
  const [errors, setErrors] = useState<CheckinErrors>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [undo, setUndo] = useState<Checkin | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  const history = [...checkins].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const errorList = Object.entries(errors).filter(([, v]) => v) as [string, string][];

  function set(key: keyof CheckinForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
    setSaved(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateCheckin(form, unit, today);
    if (!r.values) {
      setErrors(r.errors);
      setAttempt((n) => n + 1);
      return;
    }
    addCheckin(r.values);
    setErrors({});
    setForm(empty(today));
    setSaved(`Check-in for ${shortDate(r.values.date)} saved. See the trend on Progress.`);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl font-black leading-none">Body check-in</h1>
        <p className="mt-2 max-w-prose text-muted">
          Optional, and once a month is plenty. Fill in any of these. You only ever see your own trend: no targets, no &ldquo;ideal&rdquo; numbers.
        </p>
      </header>

      {undo && (
        <Banner
          tone="info"
          title={`Check-in from ${shortDate(undo.date)} deleted`}
          action={
            <Button
              variant="secondary"
              className="!min-h-11 !text-base"
              onClick={() => {
                restoreCheckin(undo);
                setUndo(null);
              }}
            >
              Undo
            </Button>
          }
        />
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {errorList.length > 0 && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="border-2 border-danger bg-surface p-4">
            <p className="font-semibold text-danger">{errorList.length === 1 ? "One thing to fix:" : `${errorList.length} things to fix:`}</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {errorList.map(([k, msg]) => (
                <li key={k}>{k === "form" ? msg : <a href={`#checkin-${k}`} className="underline">{msg}</a>}</li>
              ))}
            </ul>
          </div>
        )}

        <Field id="checkin-date" label="Date" error={errors.date}>
          {(p) => <Input {...p} type="date" max={today} value={form.date} invalid={!!errors.date} onChange={(e) => set("date", e.target.value)} className="max-w-56" />}
        </Field>

        {CHECKIN_FIELDS.map(({ key, label }) => (
          <Field key={key} id={`checkin-${key}`} label={`${label} (${unitFor(key, unit)})`} optional error={errors[key]}>
            {(p) => (
              <Input
                {...p}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form[key]}
                invalid={!!errors[key]}
                onChange={(e) => set(key, e.target.value)}
                className="max-w-56"
              />
            )}
          </Field>
        ))}

        <div className="flex flex-col gap-3">
          {saved && <Banner tone="success" title={saved} />}
          <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
            Save check-in
          </Button>
          <p className="text-sm text-muted">Measure the same way each time (same time of day, same spot on the tape) so the trend means something.</p>
        </div>
      </form>

      {history.length > 0 && (
        <section aria-labelledby="past">
          <h2 id="past" className="font-display text-3xl font-extrabold">
            Past check-ins
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{shortDate(c.date)}</p>
                  <p className="text-sm text-muted">
                    {CHECKIN_FIELDS.filter((f) => c[f.key] !== undefined)
                      .map((f) => `${f.label} ${fmtWeight(c[f.key] as number)} ${unitFor(f.key, c.unit)}`)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setUndo(deleteCheckin(c.id))}>
                  Delete<span className="sr-only"> check-in from {shortDate(c.date)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <ButtonLink href="/progress" variant="ghost">
          ← Back to Progress
        </ButtonLink>
      </div>
    </div>
  );
}
