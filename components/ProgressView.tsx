"use client";

import { useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { Calendar } from "./Calendar";
import { FlashBanner } from "./FlashBanner";
import { ConfirmDialog } from "./Modal";
import { Sparkline } from "./Sparkline";
import { LoadingState, NeedsProfile } from "./States";
import { recentCount } from "@/lib/adapt";
import type { CompletedWorkout, WeightBook } from "@/lib/adapt";
import { CHECKIN_FIELDS, series, unitFor } from "@/lib/checkin";
import type { Checkin } from "@/lib/checkin";
import { fmtWeight } from "@/lib/data";
import type { Profile } from "@/lib/data";
import { shortDate } from "@/lib/dates";
import { getExercise } from "@/lib/library";
import { getLook } from "@/lib/looks";
import { exercisesDone, liftSeries, weightedLifts, workoutDates } from "@/lib/progress";
import { deleteWorkout, restoreWorkout, useIronlog, useToday } from "@/lib/store";
import { planOverview, workoutTitle } from "@/lib/workouts";

export function ProgressView() {
  const snap = useIronlog();
  const today = useToday();
  if (!snap.ready || !today) return <LoadingState />;
  if (!snap.data.profile) return <NeedsProfile what="Progress shows what you've done and how your weights are moving." />;
  return <Progress profile={snap.data.profile} workouts={snap.data.workouts} weights={snap.data.weights} checkins={snap.data.checkins} today={today} />;
}

function Progress({ profile, workouts, weights, checkins, today }: { profile: Profile; workouts: CompletedWorkout[]; weights: WeightBook; checkins: Checkin[]; today: string }) {
  const [toDelete, setToDelete] = useState<CompletedWorkout | null>(null);
  const [undo, setUndo] = useState<CompletedWorkout | null>(null);
  const unit = profile.unit;
  const look = getLook(profile.lookId)!;
  const history = [...workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const lifts = weightedLifts(workouts);
  const learned = exercisesDone(workouts).length;
  const bodyTrends = CHECKIN_FIELDS.map((f) => ({ ...f, points: series(checkins, f.key) })).filter((f) => f.points.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <FlashBanner />
      {undo && (
        <Banner
          tone="info"
          title={`${workoutTitle(undo.key)} on ${shortDate(undo.date)} deleted`}
          action={
            <Button
              variant="secondary"
              className="!min-h-11 !text-base"
              onClick={() => {
                restoreWorkout(undo);
                setUndo(null);
              }}
            >
              Undo
            </Button>
          }
        >
          It&apos;s gone from your history, unless you undo.
        </Banner>
      )}
      <header>
        <h1 className="font-display text-5xl font-black leading-none">Progress</h1>
        <p className="mt-2 text-muted">Training for the {look.name.toLowerCase()} look. No streaks to protect; every visit counts.</p>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Workouts", workouts.length],
          ["Last 4 weeks", recentCount(workouts, today, 28)],
          ["Exercises learned", learned],
        ].map(([label, n]) => (
          <div key={label} className="border border-line bg-surface px-3 py-4 text-center">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-stencil text-4xl font-black">{n}</dd>
          </div>
        ))}
      </dl>

      {workouts.length === 0 ? (
        <section aria-labelledby="plan" className="border-2 border-ink bg-surface p-5">
          <h2 id="plan" className="font-display text-3xl font-extrabold">
            Your plan, ready to go
          </h2>
          <p className="mt-1 text-muted">Nothing saved yet. These are your three workouts; this page fills in as you train.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {planOverview(look).map((p) => (
              <div key={p.key} className="border border-line bg-raised p-3">
                <p className="font-display text-xl font-extrabold">{workoutTitle(p.key)}</p>
                <ul className="mt-1 text-sm text-muted">
                  {p.exercises.map((e) => (
                    <li key={e.exerciseId}>{getExercise(e.exerciseId)?.name}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <ButtonLink href="/" variant="primary">
              Start your first workout
            </ButtonLink>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="cal" className="border border-line bg-surface p-5">
            <h2 id="cal" className="sr-only">
              Days you trained
            </h2>
            <Calendar trained={workoutDates(workouts)} today={today} />
          </section>

          {lifts.length > 0 && (
            <section aria-labelledby="lifts">
              <h2 id="lifts" className="font-display text-3xl font-extrabold">
                Your weights
              </h2>
              <p className="mt-1 text-sm text-muted">&ldquo;Next time&rdquo; is what we&apos;ll suggest, based on how each one felt.</p>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {lifts.map((id) => {
                  const pts = liftSeries(workouts, id);
                  const first = pts[0];
                  const last = pts[pts.length - 1];
                  const memory = weights[id];
                  const text =
                    pts.length > 1
                      ? `From ${fmtWeight(first.weight)} to ${fmtWeight(last.weight)} ${unit} over ${pts.length} workouts`
                      : `${fmtWeight(last.weight)} ${unit} on ${shortDate(last.date)}`;
                  return (
                    <li key={id} className="py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <p className="text-lg font-semibold">{getExercise(id)?.name}</p>
                        {memory && (
                          <p className="text-sm text-muted">
                            Next time: <span className="font-stencil text-2xl font-black text-ink">{fmtWeight(memory.weight)}</span> {unit}
                          </p>
                        )}
                      </div>
                      {pts.length > 1 && <Sparkline values={pts.map((p) => p.weight)} label={text} />}
                      <p className="text-sm text-muted">{text}.</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <section aria-labelledby="body" className="border border-line bg-surface p-5">
        <h2 id="body" className="font-display text-3xl font-extrabold">
          Body check-ins
        </h2>
        {bodyTrends.length === 0 ? (
          <p className="mt-1 text-muted">Optional. Once a month, note your weight or a few measurements to see the trend. Your own numbers only, no targets.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {bodyTrends.map((f) => {
              const first = f.points[0];
              const last = f.points[f.points.length - 1];
              const u = unitFor(f.key, unit);
              const text =
                f.points.length > 1
                  ? `${f.label}: ${fmtWeight(first.value)} → ${fmtWeight(last.value)} ${u} (${shortDate(first.date)} to ${shortDate(last.date)})`
                  : `${f.label}: ${fmtWeight(last.value)} ${u} on ${shortDate(last.date)}`;
              return (
                <li key={f.key}>
                  {f.points.length > 1 && <Sparkline values={f.points.map((p) => p.value)} label={text} />}
                  <p className="text-sm">{text}</p>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4">
          <ButtonLink href="/checkin" variant="secondary">
            {checkins.length ? "Add or review check-ins" : "Add a check-in"}
          </ButtonLink>
        </div>
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history">
          <h2 id="history" className="font-display text-3xl font-extrabold">
            Workouts
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((w) => {
              const done = w.exercises.filter((e) => !e.skipped && e.setsDone > 0).length;
              return (
                <li key={w.id} className="border border-line bg-surface">
                  <details>
                    <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2">
                      <span>
                        <span className="block text-lg font-semibold">{workoutTitle(w.key)}</span>
                        <span className="text-sm text-muted">
                          {shortDate(w.date)} · {done} of {w.exercises.length} exercises
                        </span>
                      </span>
                      <span aria-hidden className="text-muted">
                        ▾
                      </span>
                    </summary>
                    <div className="border-t border-line px-4 py-3">
                      <ul className="flex flex-col gap-1 text-sm">
                        {w.exercises.map((e) => (
                          <li key={e.exerciseId} className="flex justify-between gap-3">
                            <span className="font-semibold">{getExercise(e.exerciseId)?.name}</span>
                            <span className="text-muted">
                              {e.skipped
                                ? "skipped"
                                : `${e.setsDone}/${e.setsPlanned} sets${e.weight !== null ? ` · ${fmtWeight(e.weight)} ${w.unit}` : ""}${e.feedback ? ` · ${e.feedback === "right" ? "just right" : e.feedback}` : ""}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {w.note && (
                        <p className="mt-3 border-l-4 border-line pl-3 text-sm text-muted">
                          <span className="font-semibold text-ink">Note: </span>
                          {w.note}
                        </p>
                      )}
                      <div className="mt-3">
                        <Button variant="danger" className="!min-h-11 !text-base" onClick={() => setToDelete(w)}>
                          Delete workout
                        </Button>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this workout?"
        body={toDelete ? `${workoutTitle(toDelete.key)} on ${shortDate(toDelete.date)} will be removed from your history. Your remembered weights stay as they are.` : ""}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) setUndo(deleteWorkout(toDelete.id));
          setToDelete(null);
        }}
      />
    </div>
  );
}
