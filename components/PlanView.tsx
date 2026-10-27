"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { BackupPanel } from "./BackupPanel";
import { FoodSleepCard } from "./FoodSleepCard";
import { LookPicker } from "./LookPicker";
import { ConfirmDialog } from "./Modal";
import { NutritionPanel } from "./NutritionPanel";
import { ReminderPanel } from "./ReminderPanel";
import { Segmented } from "./Segmented";
import { LoadingState, NeedsProfile } from "./States";
import type { Unit } from "@/lib/adapt";
import type { Data, Profile } from "@/lib/data";
import { getExercise } from "@/lib/library";
import { CAN_AND_CANT, getLook } from "@/lib/looks";
import type { LookId } from "@/lib/looks";
import { chooseLook, resetAll, setUnit, useIronlog } from "@/lib/store";
import { planOverview, workoutTitle } from "@/lib/workouts";

export function PlanView() {
  const snap = useIronlog();
  if (!snap.ready) return <LoadingState />;
  if (!snap.data.profile) return <NeedsProfile what="Your plan is where you change your look and settings." />;
  return <Plan profile={snap.data.profile} data={snap.data} />;
}

function Plan({ profile, data }: { profile: Profile; data: Data }) {
  const router = useRouter();
  const [look, setLook] = useState<LookId>(profile.lookId);
  const [unit, setUnitState] = useState<Unit>(profile.unit);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const preview = getLook(look)!;
  const count = data.workouts.length;

  function save(e: React.FormEvent) {
    e.preventDefault();
    const unitChanged = unit !== profile.unit;
    if (look !== profile.lookId) chooseLook(look);
    if (unitChanged) setUnit(unit);
    setSaved(
      unitChanged && count > 0
        ? `Saved. Weights now show in ${unit}; what you entered before is kept exactly as typed.`
        : "Saved. Your next workout follows this plan, and your history and weights stay.",
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl font-black uppercase leading-none tracking-wide">Your plan</h1>
        <p className="mt-2 text-muted">Change your look any time. Your history and remembered weights stay.</p>
      </header>

      <form onSubmit={save} noValidate className="flex flex-col gap-8">
        <LookPicker
          legend="Your look"
          value={look}
          onChange={(id) => {
            setLook(id);
            setSaved(null);
          }}
        />

        <section aria-labelledby="workouts" className="border border-line bg-surface p-5">
          <h2 id="workouts" className="font-display text-3xl font-extrabold uppercase tracking-wide">
            Your three workouts
          </h2>
          <p className="mt-1 text-muted">
            For {preview.name}: {preview.description} Every workout trains your whole body, so a missed week leaves no gap.
          </p>
          <p className="mt-2 text-muted">
            They rotate A → B → C, and Today always shows the next one. Want a different one today? Pick it under &ldquo;Your plan&rdquo; on{" "}
            <Link href="/" className="font-semibold text-ink underline underline-offset-4">
              Today
            </Link>
            .
          </p>
          {/* a plain overview, not a set of choices: no tile borders, nothing that looks pressable */}
          <dl className="mt-4 grid gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
            {planOverview(preview).map((p) => (
              <div key={p.key}>
                <dt className="font-display text-2xl font-extrabold">
                  {workoutTitle(p.key)} <span className="font-body text-base font-normal text-muted">· about {p.minutes} min</span>
                </dt>
                <dd>
                  <ul className="mt-1 text-muted">
                    {p.exercises.map((e) => (
                      <li key={e.exerciseId}>{getExercise(e.exerciseId)?.name}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <Segmented<Unit>
          legend="Weights in"
          name="unit"
          value={unit}
          onChange={(u) => {
            setUnitState(u);
            setSaved(null);
          }}
          options={[
            { value: "lb", label: "Pounds", sub: "lb · inches" },
            { value: "kg", label: "Kilograms", sub: "kg · cm" },
          ]}
        />

        <div className="flex flex-col gap-3">
          {saved && <Banner tone="success" title={saved} />}
          <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
            Save changes
          </Button>
        </div>
      </form>

      <section aria-labelledby="honest" className="border-l-4 border-ink bg-surface p-5">
        <h2 id="honest" className="font-display text-3xl font-extrabold uppercase tracking-wide">
          What can training do?
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {CAN_AND_CANT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <FoodSleepCard />

      <section aria-labelledby="nutrition" className="border border-line bg-surface p-5">
        <h2 id="nutrition" className="font-display text-3xl font-extrabold uppercase tracking-wide">
          Calorie and protein estimate
        </h2>
        <p className="mb-4 mt-1 text-muted">Optional. A rough daily starting point for your look, as a range. Nothing to log.</p>
        <NutritionPanel unit={profile.unit} lookId={profile.lookId} saved={data.nutrition} />
      </section>

      <section aria-labelledby="body" className="border border-line bg-surface p-5">
        <h2 id="body" className="font-display text-3xl font-extrabold uppercase tracking-wide">
          Monthly body check-in
        </h2>
        <p className="mb-4 mt-1 text-muted">Optional. Note your weight or a few measurements once a month and see the trend on Progress.</p>
        <ButtonLink href="/checkin" variant="secondary">
          Open check-ins
        </ButtonLink>
      </section>

      <section aria-labelledby="reminders" className="border-t border-line pt-6">
        <h2 id="reminders" className="font-display text-3xl font-extrabold uppercase tracking-wide">
          Training reminders
        </h2>
        <p className="mb-4 mt-2 max-w-prose text-muted">Want a nudge? Put a few gym slots on your calendar. Miss one and nothing breaks.</p>
        <ReminderPanel perWeek={3} />
      </section>

      <section aria-labelledby="data" className="border-t border-line pt-6">
        <h2 id="data" className="font-display text-3xl font-extrabold uppercase tracking-wide">
          Your data
        </h2>
        <p className="mb-4 mt-2 max-w-prose text-muted">
          Everything lives in this browser on this device. There&apos;s no account and nothing is sent anywhere. Clearing your browser&apos;s site data
          would erase it, so keep a backup.
        </p>
        <BackupPanel sessionCount={count} />
        <div className="mt-8 border-t border-line pt-5">
          <p className="mb-3 text-muted">Start completely fresh:</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset everything
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Erase all your data?"
        body={`This deletes your plan, ${count} saved ${count === 1 ? "workout" : "workouts"}, your check-ins and your remembered weights from this device. It can't be undone.`}
        confirmLabel="Erase everything"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetAll();
          router.push("/");
        }}
      />
    </div>
  );
}
