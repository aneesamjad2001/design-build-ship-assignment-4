"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { FlashBanner } from "./FlashBanner";
import { LookPicker } from "./LookPicker";
import { Segmented } from "./Segmented";
import { LoadingState, SafetyNote } from "./States";
import { lastWorkout, nextWorkout, recentCount, suggestedWeight } from "@/lib/adapt";
import type { CompletedWorkout, WeightBook } from "@/lib/adapt";
import { nowMs } from "@/lib/clock";
import { fmtWeight } from "@/lib/data";
import type { Profile } from "@/lib/data";
import { daysBetween, parseDate, relativeDay } from "@/lib/dates";
import { focusPageHeading } from "@/lib/focus";
import { readInProgress, writeInProgress } from "@/lib/inprogress";
import type { InProgress } from "@/lib/inprogress";
import { getExercise, measureLabel } from "@/lib/library";
import { getLook } from "@/lib/looks";
import type { LookId } from "@/lib/looks";
import { chooseLook, setTime, useIronlog, useToday } from "@/lib/store";
import { TIME_OPTIONS, WORKOUT_KEYS, buildWorkout, describeFeeling, workoutTitle } from "@/lib/workouts";
import type { Feeling, PlannedExercise, TimeOption, WorkoutKey } from "@/lib/workouts";

/** "3 × 8–12" (no set count for a single set, e.g. a 5-minute walk). */
const amount = (p: PlannedExercise) => `${p.sets > 1 ? `${p.sets} × ` : ""}${p.min === p.max ? p.min : `${p.min}–${p.max}`}`;

export function TodayView() {
  const snap = useIronlog();
  const today = useToday();
  if (!snap.ready || !today) return <LoadingState />;
  if (!snap.data.profile) return <Onboarding />;
  return (
    <Today
      profile={snap.data.profile}
      workouts={snap.data.workouts}
      weights={snap.data.weights}
      lastCheckin={snap.data.checkins.reduce((m, c) => (c.date > m ? c.date : m), "")}
      today={today}
      persistent={snap.persistent}
      recovered={snap.recovered}
    />
  );
}

/* ------------------------------------------------------------------ */
/* First visit: one pick takes a cold start to a real plan.            */
/* ------------------------------------------------------------------ */

const STEPS = [
  ["Pick a look", "Say what kind of body you're aiming for, in plain words."],
  ["Get today's workout", "Exact exercises, how to do each one, and where to start the weights."],
  ["Come back whenever", "It remembers what you did and tells you what's next. No schedule to keep."],
];

function Onboarding() {
  const [look, setLook] = useState<LookId | null>(null);
  const [error, setError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!look) {
      setError("Pick the look you're aiming for so we can build your plan.");
      formRef.current?.querySelector<HTMLInputElement>('input[name="look"]')?.focus({ preventScroll: true });
      formRef.current?.querySelector("legend")?.scrollIntoView({ block: "start" });
      return;
    }
    chooseLook(look);
    focusPageHeading();
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-lg text-muted">Welcome to Ironlog</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-none sm:text-6xl">Never walk into the gym without a plan</h1>
        <p className="mt-3 max-w-prose text-lg text-muted">
          Tell us the body you want. Ironlog builds your workouts and, every time you show up, tells you exactly what to do next — however long it&apos;s
          been. No sign-up; it saves on this device.
        </p>
      </header>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="border border-line bg-surface p-4">
            <span className="font-stencil text-3xl font-black text-muted" aria-hidden>
              {i + 1}
            </span>
            <p className="font-display text-xl font-extrabold">{title}</p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <LookPicker
          value={look}
          onChange={(id) => {
            setLook(id);
            setError(undefined);
          }}
          error={error}
        />
        <div className="flex flex-col gap-3">
          <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
            Show my plan
          </Button>
          <SafetyNote />
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today: what to do next, and why.                                     */
/* ------------------------------------------------------------------ */

function Today({
  profile,
  workouts,
  weights,
  lastCheckin,
  today,
  persistent,
  recovered,
}: {
  profile: Profile;
  workouts: CompletedWorkout[];
  weights: WeightBook;
  lastCheckin: string;
  today: string;
  persistent: boolean;
  recovered: boolean;
}) {
  const router = useRouter();
  const look = getLook(profile.lookId)!;
  const next = nextWorkout(workouts, today);
  const [feeling, setFeeling] = useState<Feeling>("normal");
  // a different workout picked from "Your plan" for today only; null = the one the rotation suggests
  const [picked, setPicked] = useState<WorkoutKey | null>(null);
  const key = picked ?? next.key;
  const isPick = key !== next.key;
  // an unfinished workout saved as you go. Today only renders after the browser has been read, so this never runs on the server.
  const [draft] = useState(() => readInProgress());

  const ctx = { intro: next.isFirst, daysAway: next.daysAway, feeling, makeUps: next.makeUps };
  const planned = buildWorkout(look, key, profile.time, ctx);
  // the same workout at "normal", so the picker can say (and the list can show) what changed
  const baseline = buildWorkout(look, key, profile.time, { ...ctx, feeling: "normal" });
  const baselineById = new Map(baseline.exercises.map((p) => [p.exerciseId, p]));
  const lighterWeights = feeling === "tired" && planned.exercises.some((p) => suggestedWeight(p.exerciseId, weights, next.daysAway, profile.unit) != null);
  const feelingLine = describeFeeling(feeling, baseline, planned, { lighterWeights });
  const minutes = Object.fromEntries(TIME_OPTIONS.map((t) => [t, buildWorkout(look, key, t, ctx).minutes])) as Record<TimeOption, number>;
  const dateLine = parseDate(today).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const last = lastWorkout(workouts);
  const lastCount = recentCount(workouts, today, 28);
  const checkinDue = lastCheckin !== "" && daysBetween(lastCheckin, today) >= 28;

  function start() {
    const w: InProgress = {
      startedAt: nowMs(),
      unit: profile.unit,
      feeling,
      planned,
      index: 0,
      progress: Object.fromEntries(
        planned.exercises.map((p) => {
          const s = suggestedWeight(p.exerciseId, weights, next.daysAway, profile.unit, feeling);
          return [p.exerciseId, { setsDone: 0, weight: s != null ? fmtWeight(s) : "" }];
        }),
      ),
      note: "",
    };
    writeInProgress(w);
    router.push("/workout");
  }

  return (
    <div className="flex flex-col gap-6">
      <FlashBanner />
      {!persistent && (
        <Banner tone="warning" title="Your browser is blocking storage">
          Your workouts will be lost when you close this tab. Turn off private browsing to keep them.
        </Banner>
      )}
      {recovered && (
        <Banner tone="warning" title="Some saved data couldn't be read">
          We kept everything we could. Anything unreadable was skipped.
        </Banner>
      )}
      {draft && (
        <Banner tone="info" title="You have a workout in progress">
          {workoutTitle(draft.planned.key)}, started at {new Date(draft.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
          Your place is saved.
        </Banner>
      )}

      <header>
        <p className="text-lg text-muted">{next.isFirst ? "Your plan is ready" : dateLine}</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-none sm:text-6xl">
          {next.isFirst ? "Your first workout" : "Welcome back"}
        </h1>
        <p className="mt-2 text-lg text-muted">
          {last ? `Last workout: ${workoutTitle(last.key)}, ${relativeDay(last.date, today)}.` : `Built for the ${look.name.toLowerCase()} look.`}
        </p>
      </header>

      {planned.notes.map((n) => (
        <Banner key={n} tone="info" title={n} />
      ))}
      {checkinDue && (
        <Banner
          tone="info"
          title="Time for a monthly check-in?"
          action={
            <ButtonLink href="/checkin" variant="secondary" className="!min-h-11 !text-base">
              Add one
            </ButtonLink>
          }
        >
          Optional — a minute to note your numbers so you can see the trend.
        </Banner>
      )}

      <section aria-labelledby="next-heading" className="border-2 border-ink bg-surface p-5">
        <p className="text-lg text-muted">{isPick ? "Your pick for today" : next.repeat ? "Finish this one" : "Next up"}</p>
        <h2 id="next-heading" className="font-display text-5xl font-black leading-none">
          {workoutTitle(key)}
        </h2>
        {isPick ? (
          <div className="mt-2 flex flex-col items-start gap-1">
            <p className="text-muted">
              You picked this one from your plan. Next in the rotation is {workoutTitle(next.key)}; once you finish this one, the plan carries on from{" "}
              {workoutTitle(key)}.
            </p>
            <Button variant="ghost" onClick={() => setPicked(null)} className="!px-0">
              Back to {workoutTitle(next.key)} (next up)
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-muted">
            <span className="font-semibold text-ink">Why: </span>
            {next.reason}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-4">
          {next.isFirst ? (
            <p className="text-sm text-muted">Your first one is short on purpose. Next time you can choose how long you have.</p>
          ) : (
          <Segmented<TimeOption>
            legend="How long do you have?"
            name="time"
            value={profile.time}
            onChange={(t) => setTime(t)}
            options={[
              { value: "short", label: "Short", sub: `about ${minutes.short} min` },
              { value: "standard", label: "Standard", sub: `about ${minutes.standard} min` },
              { value: "long", label: "Long", sub: `about ${minutes.long} min` },
            ]}
          />
          )}
          <Segmented<Feeling>
            legend="How are you feeling?"
            name="feeling"
            value={feeling}
            onChange={setFeeling}
            options={[
              { value: "fresh", label: "Fresh" },
              { value: "normal", label: "Normal" },
              { value: "tired", label: "Tired" },
            ]}
            hint={
              <span aria-live="polite" className={feeling === "normal" ? "" : "font-semibold text-ink"}>
                {feelingLine}
              </span>
            }
          />
        </div>

        <div className="mt-5">
          {draft ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/workout" variant="primary" className="w-full sm:w-auto">
                Resume workout
              </ButtonLink>
              <Button variant="secondary" onClick={start} className="w-full sm:w-auto">
                Start a new one instead
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={start} className="w-full sm:w-auto">
              Start workout
            </Button>
          )}
        </div>

        <ol className="mt-5 divide-y divide-line border-y border-line">
          {planned.exercises.map((p) => {
            const e = getExercise(p.exerciseId)!;
            const w = suggestedWeight(p.exerciseId, weights, next.daysAway, profile.unit, feeling);
            const sub = p.note ?? (w != null ? `Start with ${fmtWeight(w)} ${profile.unit}` : e.weighted ? "We'll help you find a starting weight" : "Just your bodyweight");
            const was = baselineById.get(p.exerciseId);
            const changed = was != null && (was.sets !== p.sets || was.min !== p.min || was.max !== p.max);
            return (
              <li key={p.exerciseId} className="flex items-baseline justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{e.name}</p>
                  <p className="text-sm text-muted">
                    {sub}
                    {changed && was && ` · normally ${amount(was)}`}
                  </p>
                </div>
                <p
                  // remounts when the feeling changes, so the highlight replays on what changed
                  key={changed ? feeling : "same"}
                  className={`flex-none font-stencil text-2xl font-black ${changed ? "changed px-1.5" : ""}`}
                >
                  {amount(p)} <span className="font-body text-base font-semibold text-muted">{measureLabel(e.measure)}</span>
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="plan-heading" className="border border-line bg-surface p-5">
        <h2 id="plan-heading" className="font-display text-3xl font-extrabold">
          Your plan
        </h2>
        <p className="mt-1 text-muted">
          Built for <span className="font-semibold text-ink">{look.name}</span>. Three full-body workouts that repeat — do the next one whenever you go, or
          pick another for today.
        </p>
        <div className="mt-4">
          <Segmented<WorkoutKey>
            legend="Which workout today?"
            name="workout"
            value={key}
            onChange={(k) => setPicked(k === next.key ? null : k)}
            options={WORKOUT_KEYS.map((k) => ({
              value: k,
              label: (
                <>
                  <span className="sr-only">Workout </span>
                  {k}
                </>
              ),
              sub: k === next.key ? "Next up" : last?.key === k ? "Last done" : "In the rotation",
            }))}
            hint={
              <span aria-live="polite">
                {isPick ? `Showing ${workoutTitle(key)} above: its exercises, time and Start button. Pick ${next.key} to go back to the next one in your plan.` : `Showing ${workoutTitle(key)} above, the next one in your plan.`}
              </span>
            }
          />
        </div>
        {workouts.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            {lastCount} {lastCount === 1 ? "workout" : "workouts"} in the last four weeks. Even one a week keeps what you&apos;ve built.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-2">
          <ButtonLink href="/progress" variant="ghost">
            See my progress →
          </ButtonLink>
          <ButtonLink href="/plan" variant="ghost">
            Change my look →
          </ButtonLink>
        </div>
      </section>

      <footer className="flex flex-col gap-2">
        <p className="text-sm text-muted">Saved on this device. Miss a week? Nothing to catch up on — just do the next workout.</p>
        <SafetyNote />
      </footer>
    </div>
  );
}
