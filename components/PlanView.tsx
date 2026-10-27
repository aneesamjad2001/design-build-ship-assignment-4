"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "./Button";
import { BackupPanel } from "./BackupPanel";
import { Disclosure } from "./Disclosure";
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
import { chooseLook, resetAll, setFlash, setUnit, useIronlog } from "@/lib/store";
import { planOverview, workoutTitle } from "@/lib/workouts";

export function PlanView() {
  const snap = useIronlog();
  if (!snap.ready) return <LoadingState />;
  if (!snap.data.profile) return <NeedsProfile what="Your plan is where you change your look and settings." />;
  return <Plan profile={snap.data.profile} data={snap.data} />;
}

function Plan({ profile, data }: { profile: Profile; data: Data }) {
  const router = useRouter();
  // each choice saves the moment it's made: a separate Save button far down the page
  // let people leave thinking they'd changed their look when they hadn't
  const [lookSaved, setLookSaved] = useState<string | null>(null);
  const [unitSaved, setUnitSaved] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const preview = getLook(profile.lookId)!;
  const count = data.workouts.length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl font-black leading-none">Your plan</h1>
        <p className="mt-2 text-muted">Change your look or units any time; each choice saves straight away. Your history and remembered weights stay.</p>
      </header>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <LookPicker
            legend="Your look"
            value={profile.lookId}
            onChange={(id) => {
              if (id === profile.lookId) return;
              chooseLook(id);
              setLookSaved(`Saved. Your next workout is built for ${getLook(id)!.name}; your history and weights stay.`);
            }}
          />
          <p aria-live="polite" className="font-semibold">
            {lookSaved && `✓ ${lookSaved}`}
          </p>
        </div>

        <Disclosure id="workouts" title="Your three workouts" summary="They rotate A → B → C, and Today always shows the next one.">
          <p className="text-muted">
            For {preview.name}: {preview.description} Every workout trains your whole body, so a missed week leaves no gap. Want a different one
            today? Pick it under &ldquo;Your plan&rdquo; on{" "}
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
        </Disclosure>

        <div className="flex flex-col gap-3">
          <Segmented<Unit>
            legend="Weights in"
            name="unit"
            value={profile.unit}
            onChange={(u) => {
              if (u === profile.unit) return;
              setUnit(u);
              setUnitSaved(
                count > 0
                  ? `Saved. Weights now show in ${u}. Earlier entries are converted and rounded for display; what you typed is kept, so switching back shows it again.`
                  : `Saved. Weights now show in ${u}.`,
              );
            }}
            options={[
              { value: "lb", label: "Pounds", sub: "lb · inches" },
              { value: "kg", label: "Kilograms", sub: "kg · cm" },
            ]}
          />
          <p aria-live="polite" className="font-semibold">
            {unitSaved && `✓ ${unitSaved}`}
          </p>
        </div>
      </div>

      <section aria-labelledby="honest" className="border-l-4 border-ink bg-surface p-5">
        <h2 id="honest" className="font-display text-3xl font-extrabold">
          What can training do?
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
          {CAN_AND_CANT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <FoodSleepCard />

      <Disclosure id="nutrition" title="Calorie and protein estimate" summary="Optional. A rough daily range for your look. Nothing to log.">
        <NutritionPanel unit={profile.unit} lookId={profile.lookId} saved={data.nutrition} />
      </Disclosure>

      <section aria-labelledby="body" className="border border-line bg-surface p-5">
        <h2 id="body" className="font-display text-3xl font-extrabold">
          Monthly body check-in
        </h2>
        <p className="mb-4 mt-1 text-muted">Optional. Note your weight or a few measurements once a month and see the trend on Progress.</p>
        <ButtonLink href="/checkin" variant="secondary">
          Open check-ins
        </ButtonLink>
      </section>

      <Disclosure id="reminders" title="Training reminders" summary="Put a few gym slots on your calendar. Miss one and nothing breaks.">
        <ReminderPanel perWeek={3} />
      </Disclosure>

      <Disclosure id="data" title="Your data" summary="Download a backup, restore one, or start fresh.">
        <p className="mb-4 max-w-prose text-muted">
          Your plan, workouts, check-ins and saved exercises are saved to your account, and only you can see them. You can download a copy of your
          plan, workouts and check-ins any time, or restore one (including a backup from the earlier, device-only Ironlog). Saved exercises aren&apos;t in
          the backup file; they stay in your account.
        </p>
        <BackupPanel sessionCount={count} />
        <div className="mt-8 border-t border-line pt-5">
          <p className="mb-3 text-muted">Start completely fresh:</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset everything
          </Button>
        </div>
      </Disclosure>

      <ConfirmDialog
        open={confirmReset}
        title="Erase all your data?"
        body={`This deletes your plan, ${count} saved ${count === 1 ? "workout" : "workouts"}, your check-ins, your remembered weights and your saved exercises from your account. It can't be undone.`}
        confirmLabel="Erase everything"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetAll();
          setFlash({ title: "Everything erased", detail: "Your account is empty now. Pick a look to start again.", path: "/" });
          router.push("/");
        }}
      />
    </div>
  );
}
