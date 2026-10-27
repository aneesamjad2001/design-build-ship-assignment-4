"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Field, FieldError, Input } from "./Field";
import type { Unit } from "@/lib/adapt";
import type { LookId } from "@/lib/looks";
import { ACTIVITY_LABELS, estimate, validateNutrition } from "@/lib/nutrition";
import type { Activity, NutritionErrors, NutritionForm, NutritionProfile } from "@/lib/nutrition";
import { saveNutrition } from "@/lib/store";

const radio =
  "flex min-h-12 cursor-pointer items-center gap-3 border-2 border-field bg-surface px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-on-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

const kcal = (n: number) => n.toLocaleString("en-US");

/**
 * Item 4, the safe part of it: a rough calorie and protein starting point, opt-in,
 * shown as ranges, adults only, never below resting needs. No food log and no weight
 * goal: logging meals needs a food database (no outside services here) and is the
 * chore this app exists to avoid.
 */
export function NutritionPanel({ unit, lookId, saved }: { unit: Unit; lookId: LookId; saved: NutritionProfile | null }) {
  const [editing, setEditing] = useState(saved === null);
  const [form, setForm] = useState<NutritionForm>({ age: "", sex: "", height: "", weight: "", activity: "" });
  const [errors, setErrors] = useState<NutritionErrors>({});
  const [attempt, setAttempt] = useState(0);
  const firstError = useRef<string | null>(null);
  useEffect(() => {
    if (attempt > 0 && firstError.current) document.getElementById(firstError.current)?.focus();
  }, [attempt]);

  const set = (k: keyof NutritionForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateNutrition(form, unit);
    if (!r.profile) {
      setErrors(r.errors);
      const order = ["age", "sex", "height", "weight", "activity"] as const;
      const k = order.find((x) => r.errors[x]);
      firstError.current = k === "sex" ? "nutrition-sex-female" : k === "activity" ? "nutrition-activity-low" : k ? `nutrition-${k}` : null;
      setAttempt((n) => n + 1);
      return;
    }
    saveNutrition(r.profile);
    setEditing(false);
  }

  if (saved && !editing) {
    const est = estimate(saved, lookId);
    return (
      <div className="flex flex-col gap-4">
        <dl className="grid gap-2 sm:grid-cols-3">
          <div className="border border-line bg-raised p-3">
            <dt className="text-sm text-muted">To stay the same</dt>
            <dd className="font-stencil text-2xl font-black">
              {kcal(est.maintenance[0])}–{kcal(est.maintenance[1])} <span className="text-base text-muted">kcal/day</span>
            </dd>
          </div>
          <div className="border-2 border-ink bg-raised p-3">
            <dt className="text-sm text-muted">Starting point for your look</dt>
            <dd className="font-stencil text-2xl font-black">
              {kcal(est.target[0])}–{kcal(est.target[1])} <span className="text-base text-muted">kcal/day</span>
            </dd>
          </div>
          <div className="border border-line bg-raised p-3">
            <dt className="text-sm text-muted">Protein</dt>
            <dd className="font-stencil text-2xl font-black">
              {est.protein[0]}–{est.protein[1]} <span className="text-base text-muted">g/day</span>
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted">
          {est.direction === "above"
            ? "Slightly above what you'd need to stay the same, since building muscle takes a little extra."
            : est.direction === "below"
              ? "Slightly below what you'd need to stay the same. A small gap, never a crash diet."
              : "About what you'd need to stay the same."}{" "}
          This is a formula (Mifflin–St Jeor) that can be off by 10–20% for any one person. Treat it as a place to start, not a rule, and judge by how you
          feel and how training goes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Recalculate
          </Button>
          <Button variant="ghost" onClick={() => saveNutrition(null)}>
            Delete my numbers
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Skip this if counting calories isn&apos;t for you, or if it&apos;s been stressful in the past. For adults 18 and over. Saved on this device only.
      </p>
      <Field id="nutrition-age" label="Age" error={errors.age}>
        {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={form.age} invalid={!!errors.age} onChange={(e) => set("age", e.target.value)} className="max-w-40" />}
      </Field>
      <fieldset aria-describedby={errors.sex ? "nutrition-sex-error" : undefined}>
        <legend className="mb-1 text-base font-semibold">Formula version</legend>
        <p className="mb-2 text-sm text-muted">The equation has a female and a male version. Pick the one closer to your body.</p>
        <div className="grid grid-cols-2 gap-2">
          {(["female", "male"] as const).map((s) => (
            <label key={s} className={radio}>
              <input id={`nutrition-sex-${s}`} type="radio" name="nutrition-sex" value={s} checked={form.sex === s} onChange={() => set("sex", s)} className="sr-only" />
              <span className="font-semibold capitalize">{s}</span>
            </label>
          ))}
        </div>
        {errors.sex && (
          <div className="mt-2">
            <FieldError id="nutrition-sex-error">{errors.sex}</FieldError>
          </div>
        )}
      </fieldset>
      <Field id="nutrition-height" label={`Height (${unit === "lb" ? "inches" : "cm"})`} hint={unit === "lb" ? "5 ft 10 in = 70 inches." : undefined} error={errors.height}>
        {(p) => <Input {...p} inputMode="decimal" autoComplete="off" value={form.height} invalid={!!errors.height} onChange={(e) => set("height", e.target.value)} className="max-w-40" />}
      </Field>
      <Field id="nutrition-weight" label={`Body weight (${unit})`} error={errors.weight}>
        {(p) => <Input {...p} inputMode="decimal" autoComplete="off" value={form.weight} invalid={!!errors.weight} onChange={(e) => set("weight", e.target.value)} className="max-w-40" />}
      </Field>
      <fieldset aria-describedby={errors.activity ? "nutrition-activity-error" : undefined}>
        <legend className="mb-2 text-base font-semibold">A normal day for you</legend>
        <div className="flex flex-col gap-2">
          {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
            <label key={a} className={radio}>
              <input id={`nutrition-activity-${a}`} type="radio" name="nutrition-activity" value={a} checked={form.activity === a} onChange={() => set("activity", a)} className="sr-only" />
              <span>{ACTIVITY_LABELS[a]}</span>
            </label>
          ))}
        </div>
        {errors.activity && (
          <div className="mt-2">
            <FieldError id="nutrition-activity-error">{errors.activity}</FieldError>
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary">
          Show my estimate
        </Button>
        {saved && (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
