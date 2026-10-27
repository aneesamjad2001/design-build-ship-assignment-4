"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { ExerciseFigure } from "./ExerciseFigure";
import { Field, Input, Textarea } from "./Field";
import { ConfirmDialog, Dialog } from "./Modal";
import { RestTimer } from "./RestTimer";
import { Segmented } from "./Segmented";
import { LoadingState } from "./States";
import { nextWorkout, suggestedWeight, weightStep } from "@/lib/adapt";
import type { CompletedWorkout, DoneExercise, Feedback, WeightBook } from "@/lib/adapt";
import { nowMs } from "@/lib/clock";
import { MAX_NOTE, fmtWeight } from "@/lib/data";
import { EXERCISE_TEXT } from "@/lib/exerciseText";
import { focusPageHeading } from "@/lib/focus";
import { clearInProgress, readInProgress, writeInProgress } from "@/lib/inprogress";
import type { InProgress, Progress } from "@/lib/inprogress";
import { getExercise, measureLabel } from "@/lib/library";
import { getLook } from "@/lib/looks";
import { hasDoneExercise } from "@/lib/progress";
import { saveWorkout, setFlash, useIronlog, useToday } from "@/lib/store";
import { validateWeightText } from "@/lib/weightInput";
import { swapPlanned, workoutTitle } from "@/lib/workouts";
import type { PlannedExercise } from "@/lib/workouts";

const BLANK: Progress = { setsDone: 0, weight: "" };

export function WorkoutView() {
  const snap = useIronlog();
  const today = useToday();
  // the unfinished workout lives in this browser under your user id; read it once your account has loaded
  const [saved, setSaved] = useState<InProgress | null | undefined>(undefined);
  useEffect(() => {
    if (!snap.ready) return;
    const t = setTimeout(() => setSaved(readInProgress()), 0);
    return () => clearTimeout(t);
  }, [snap.ready]);

  if (!snap.ready || !today || saved === undefined) return <LoadingState />;
  if (!snap.data.profile || saved === null) return <NoWorkout />;
  return <Guided initial={saved} workouts={snap.data.workouts} weights={snap.data.weights} today={today} />;
}

function NoWorkout() {
  return (
    <section className="border border-line bg-surface p-6">
      <h1 className="font-display text-4xl font-extrabold">No workout in progress</h1>
      <p className="mt-2 text-muted">Start one from Today. It takes a single tap, and your place is saved as you go.</p>
      <div className="mt-5">
        <ButtonLink href="/" variant="primary">
          Go to Today
        </ButtonLink>
      </div>
    </section>
  );
}

function Guided({ initial, workouts, weights, today }: { initial: InProgress; workouts: CompletedWorkout[]; weights: WeightBook; today: string }) {
  const router = useRouter();
  const [w, setW] = useState(initial);
  const [rest, setRest] = useState<{ seconds: number; id: number } | null>(null);
  const [weightError, setWeightError] = useState<Record<string, string>>({});
  const [swapOpen, setSwapOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const finished = useRef(false);

  const planned = w.planned;
  const total = planned.exercises.length;
  const cur: PlannedExercise | undefined = planned.exercises[w.index];
  const look = getLook(planned.lookId);
  const daysAway = nextWorkout(workouts, today).daysAway;

  // every change is saved, so a locked phone or a stray tap never loses your place
  useEffect(() => {
    if (!finished.current) writeInProgress(w);
  }, [w]);

  // keep the screen awake while lifting, where the browser allows it
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (cancelled || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* a nicety, never a requirement */
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  const progressOf = (id: string): Progress => w.progress[id] ?? BLANK;

  function update(id: string, patch: Partial<Progress>) {
    setW((c) => ({ ...c, progress: { ...c.progress, [id]: { ...(c.progress[id] ?? BLANK), ...patch } } }));
  }

  function go(index: number) {
    setW((c) => ({ ...c, index }));
    setSwapOpen(false);
    focusPageHeading(true, true);
  }

  function tapSet(i: number) {
    if (!cur) return;
    const e = getExercise(cur.exerciseId)!;
    const done = progressOf(cur.exerciseId).setsDone;
    // tapping a finished set undoes it (and the ones after); tapping a later one marks everything up to it
    const nextDone = i < done ? i : i + 1;
    update(cur.exerciseId, { setsDone: nextDone, skipped: false });
    const lastSetOfWorkout = w.index === total - 1 && nextDone === cur.sets;
    if (nextDone > done && e.restSec > 0 && !lastSetOfWorkout) setRest((r) => ({ seconds: e.restSec, id: (r?.id ?? 0) + 1 }));
  }

  function setWeight(text: string) {
    if (!cur) return;
    const id = cur.exerciseId;
    update(id, { weight: text });
    setWeightError((m) => {
      if (!(id in m)) return m;
      const rest = { ...m };
      delete rest[id];
      return rest;
    });
  }

  function checkWeight(): boolean {
    if (!cur) return true;
    const id = cur.exerciseId;
    const e = getExercise(id)!;
    const pr = progressOf(id);
    if (!e.weighted || pr.skipped) return true;
    const c = validateWeightText(pr.weight, w.unit);
    if (!c.error) return true;
    setWeightError((m) => ({ ...m, [id]: c.error! }));
    return false;
  }

  function stepWeight(direction: 1 | -1) {
    if (!cur) return;
    const e = getExercise(cur.exerciseId)!;
    const c = validateWeightText(progressOf(cur.exerciseId).weight, w.unit);
    if (c.error) {
      checkWeight();
      document.getElementById(`weight-${cur.exerciseId}`)?.focus();
      return;
    }
    const base = c.value ?? 0;
    setWeight(fmtWeight(Math.max(0, Math.round((base + direction * weightStep(e, w.unit)) * 10) / 10)));
  }

  function next() {
    if (!cur) return;
    if (!checkWeight()) {
      document.getElementById(`weight-${cur.exerciseId}`)?.focus();
      return;
    }
    go(w.index + 1);
  }

  function skip() {
    if (!cur) return;
    update(cur.exerciseId, { skipped: true, setsDone: 0 });
    go(w.index + 1);
  }

  const swapOptions = cur
    ? (getExercise(cur.exerciseId)?.swaps ?? []).filter((id) => getExercise(id) && !planned.exercises.some((p) => p.exerciseId === id))
    : [];

  function swapTo(toId: string) {
    if (!cur || !look) return;
    const replacement = swapPlanned(cur, toId, look.style);
    if (!replacement) return;
    const from = cur.exerciseId;
    const suggestion = suggestedWeight(toId, weights, daysAway, w.unit, w.feeling);
    setW((c) => {
      const progress = { ...c.progress };
      delete progress[from];
      progress[toId] = { setsDone: 0, weight: suggestion != null ? fmtWeight(suggestion) : "" };
      return { ...c, planned: { ...c.planned, exercises: c.planned.exercises.map((x, i) => (i === c.index ? replacement : x)) }, progress };
    });
    setSwapOpen(false);
    focusPageHeading(true, true);
  }

  function afterSave(done: CompletedWorkout) {
    finished.current = true;
    clearInProgress();
    const after = nextWorkout([...workouts, done], today);
    const full = done.exercises.filter((e) => !e.skipped && e.setsDone >= e.setsPlanned).length;
    const part = done.exercises.filter((e) => !e.skipped && e.setsDone > 0 && e.setsDone < e.setsPlanned).length;
    setFlash({
      title: `${workoutTitle(done.key)} saved`,
      detail: `${full} of ${done.exercises.length} exercises finished${part ? `, ${part} partly done` : ""}. Next time: ${workoutTitle(after.key)}${after.repeat ? " (finishing this one first)" : ""}.`,
      path: "/",
    });
    router.push("/");
  }

  return (
    <div className="flex flex-col gap-6">
      {cur ? (
        <ExerciseCard
          key={cur.exerciseId}
          w={w}
          cur={cur}
          hasDone={hasDoneExercise(workouts, cur.exerciseId)}
          suggested={suggestedWeight(cur.exerciseId, weights, daysAway, w.unit, w.feeling)}
          error={weightError[cur.exerciseId]}
          canSwap={swapOptions.length > 0}
          onSet={tapSet}
          onWeight={setWeight}
          onWeightBlur={checkWeight}
          onStep={stepWeight}
          onFeedback={(fb) => update(cur.exerciseId, { feedback: fb })}
          onSwap={() => setSwapOpen(true)}
          onSkip={skip}
          onUnskip={() => update(cur.exerciseId, { skipped: false })}
          onPrev={() => go(w.index - 1)}
          onNext={next}
          onExit={() => setExitOpen(true)}
        />
      ) : (
        <FinishScreen
          w={w}
          today={today}
          onGo={go}
          onNote={(note) => setW((c) => ({ ...c, note }))}
          onSaved={afterSave}
          onDiscard={() => setDiscardOpen(true)}
        />
      )}

      {cur && <RestTimer request={rest} className="bottom-0" />}

      <Dialog open={swapOpen && !!cur} onClose={() => setSwapOpen(false)} labelledBy="swap-title">
        <div className="p-6">
          <h2 id="swap-title" className="font-display text-3xl font-extrabold">
            Swap {cur ? getExercise(cur.exerciseId)?.name : ""}
          </h2>
          <p className="mt-2 text-muted">Pick a replacement that trains the same thing. Today&apos;s plan updates to match.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {swapOptions.map((id) => (
              <li key={id}>
                <Button variant="secondary" className="w-full" onClick={() => swapTo(id)}>
                  {getExercise(id)?.name}
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => setSwapOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={exitOpen}
        title="Leave this workout?"
        body="Your place is saved. You can pick it back up from Today."
        confirmLabel="Leave workout"
        cancelLabel="Keep going"
        tone="primary"
        onCancel={() => setExitOpen(false)}
        onConfirm={() => {
          setExitOpen(false);
          router.push("/");
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Discard this workout?"
        body="Nothing from it will be saved, and your plan stays as it was."
        confirmLabel="Discard workout"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          finished.current = true;
          clearInProgress();
          router.push("/");
        }}
      />
    </div>
  );
}

/* One exercise at a time: see it, do it, tick it off. */
function ExerciseCard({
  w,
  cur,
  hasDone,
  suggested,
  error,
  canSwap,
  onSet,
  onWeight,
  onWeightBlur,
  onStep,
  onFeedback,
  onSwap,
  onSkip,
  onUnskip,
  onPrev,
  onNext,
  onExit,
}: {
  w: InProgress;
  cur: PlannedExercise;
  hasDone: boolean;
  suggested: number | null;
  error?: string;
  canSwap: boolean;
  onSet: (i: number) => void;
  onWeight: (text: string) => void;
  onWeightBlur: () => void;
  onStep: (direction: 1 | -1) => void;
  onFeedback: (fb: Feedback) => void;
  onSwap: () => void;
  onSkip: () => void;
  onUnskip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const e = getExercise(cur.exerciseId)!;
  const text = EXERCISE_TEXT[cur.exerciseId];
  const pr = w.progress[cur.exerciseId] ?? BLANK;
  const total = w.planned.exercises.length;
  const unit = w.unit;
  const step = weightStep(e, unit);
  const isLast = w.index === total - 1;
  const target = `${cur.sets > 1 ? `${cur.sets} sets × ` : ""}${cur.min === cur.max ? cur.min : `${cur.min}–${cur.max}`} ${measureLabel(e.measure)}`;

  const howTo = text ? (
    <details open={!hasDone} className="border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-xl font-semibold [&::-webkit-details-marker]:hidden">
        How to do it
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
        <p className="text-lg">{text.summary}</p>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">What you&apos;ll use: </span>
          {text.equipment}
        </p>
        <div>
          <h2 className="font-display text-xl font-extrabold">Set up</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {text.setup.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="font-display text-xl font-extrabold">While you do it</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {text.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-semibold">Common mistake: </span>
          {text.mistake}
        </p>
        <p>
          <span className="font-semibold">Where to start: </span>
          {text.startTip}
        </p>
        {text.safety && <p className="border-l-4 border-danger pl-3 text-sm">{text.safety}</p>}
      </div>
    </details>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg text-muted">
          {workoutTitle(w.planned.key)} · {w.index + 1} of {total}
        </p>
        <Button variant="ghost" onClick={onExit}>
          Exit
        </Button>
      </div>
      <div aria-hidden className="flex gap-1">
        {w.planned.exercises.map((p, i) => (
          <span
            key={p.exerciseId}
            className={`h-1.5 flex-1 ${i === w.index ? "bg-ink" : (w.progress[p.exerciseId]?.setsDone ?? 0) > 0 ? "bg-muted" : "bg-line"}`}
          />
        ))}
      </div>

      <ExerciseFigure exerciseId={cur.exerciseId} className="mx-auto w-full max-w-sm" />

      <header>
        <h1 className="font-display text-5xl font-black leading-none">{e.name}</h1>
        <p className="mt-2 font-stencil text-3xl font-black">{target}</p>
        <p className="mt-1 text-sm text-muted">
          {e.restSec > 0 ? `Rest about ${e.restSec} seconds between sets. ` : ""}
          {cur.note ? `${cur.note}.` : ""}
        </p>
      </header>

      {pr.skipped && (
        <Banner
          tone="info"
          title="Skipped. We'll fit it in next time."
          action={
            <Button variant="secondary" className="!min-h-11 !text-base" onClick={onUnskip}>
              Undo
            </Button>
          }
        />
      )}

      {e.weighted && (
        <Field
          id={`weight-${cur.exerciseId}`}
          label={`Weight (${unit})`}
          optional
          hint={
            suggested != null
              ? `Suggested ${fmtWeight(suggested)} ${unit}, based on how last time went${w.feeling === "tired" ? " and a little lighter because you're tired" : ""}.`
              : "Not sure where to start? “How to do it” explains how to pick a first weight. For dumbbells, enter one dumbbell."
          }
          error={error}
        >
          {(p) => (
            <div className="flex items-stretch gap-2">
              <Button variant="secondary" onClick={() => onStep(-1)} aria-label={`Lower the weight by ${fmtWeight(step)} ${unit}`} className="!px-5 !text-2xl">
                −
              </Button>
              <Input
                {...p}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={pr.weight}
                invalid={!!error}
                onChange={(ev) => onWeight(ev.target.value)}
                onBlur={onWeightBlur}
                className="text-center font-stencil text-3xl font-black"
              />
              <Button variant="secondary" onClick={() => onStep(1)} aria-label={`Raise the weight by ${fmtWeight(step)} ${unit}`} className="!px-5 !text-2xl">
                +
              </Button>
            </div>
          )}
        </Field>
      )}

      <fieldset>
        <legend className="mb-2 text-base font-semibold">{cur.sets === 1 ? "When you've done it" : "Tap each set when you finish it"}</legend>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: cur.sets }, (_, i) => {
            const done = i < pr.setsDone;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={done}
                onClick={() => onSet(i)}
                className={`flex h-16 min-w-16 flex-1 items-center justify-center border-2 transition-colors ${cur.sets === 1 ? "text-xl font-semibold" : "font-stencil text-3xl font-black"} ${
                  done ? "border-ink bg-ink text-on-ink" : "border-field bg-surface text-ink hover:border-ink"
                }`}
              >
                <span aria-hidden>{cur.sets === 1 ? (done ? "Done ✓" : "Mark done") : done ? "✓" : i + 1}</span>
                <span className="sr-only">{cur.sets === 1 ? "Mark this exercise done" : `Set ${i + 1} of ${cur.sets}`}</span>
              </button>
            );
          })}
        </div>
        <p role="status" className="sr-only">
          {cur.sets === 1 ? (pr.setsDone ? "Done" : "") : pr.setsDone ? `${pr.setsDone} of ${cur.sets} sets done` : ""}
        </p>
      </fieldset>

      {e.weighted && pr.setsDone > 0 && (
        <Segmented<Feedback | "">
          legend="How did that feel?"
          name={`feeling-${cur.exerciseId}`}
          value={pr.feedback ?? ""}
          onChange={(v) => {
            if (v) onFeedback(v);
          }}
          options={[
            { value: "easy", label: "Easy", sub: "go heavier" },
            { value: "right", label: "Just right", sub: "keep it" },
            { value: "hard", label: "Hard", sub: "go lighter" },
          ]}
          hint="Optional. Your answer sets the weight we suggest next time."
        />
      )}

      <div className="flex flex-col gap-3">
        <Button variant="primary" onClick={onNext} className="w-full">
          {isLast ? "Finish" : "Next exercise"}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onPrev} disabled={w.index === 0}>
            Previous
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            Skip this one
          </Button>
        </div>
        {canSwap && (
          <Button variant="ghost" onClick={onSwap}>
            Busy or not at your gym? Swap it
          </Button>
        )}
      </div>

      {/* after the controls, so a long how-to never pushes "Next exercise" off screen */}
      {howTo}
    </div>
  );
}

/* Finish: a quick look back, then save. */
function FinishScreen({
  w,
  today,
  onGo,
  onNote,
  onSaved,
  onDiscard,
}: {
  w: InProgress;
  today: string;
  onGo: (index: number) => void;
  onNote: (note: string) => void;
  onSaved: (done: CompletedWorkout) => void;
  onDiscard: () => void;
}) {
  const [now] = useState(() => nowMs());
  const [problem, setProblem] = useState<{ message: string; fixes: { index: number; name: string; error: string }[] } | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  const rows = w.planned.exercises.map((p, index) => {
    const e = getExercise(p.exerciseId)!;
    const pr = w.progress[p.exerciseId] ?? BLANK;
    const check: { value: number | null; error?: string } = e.weighted && !pr.skipped ? validateWeightText(pr.weight, w.unit) : { value: null };
    return { p, index, e, pr, check };
  });
  const doneCount = rows.filter((r) => !r.pr.skipped && r.pr.setsDone > 0).length;
  const fullCount = rows.filter((r) => !r.pr.skipped && r.pr.setsDone >= r.p.sets).length;
  const summary = `${fullCount} of ${rows.length} exercises finished${doneCount > fullCount ? `, ${doneCount - fullCount} partly done` : ""}`;
  const minutes = Math.max(1, Math.round((now - w.startedAt) / 60000));

  function save() {
    const fixes = rows.filter((r) => r.check.error).map((r) => ({ index: r.index, name: r.e.name, error: r.check.error! }));
    if (fixes.length > 0) {
      setProblem({ message: `${fixes.length === 1 ? "One weight needs" : "Some weights need"} fixing before we can save.`, fixes });
      return;
    }
    if (doneCount === 0) {
      setProblem({ message: "Mark at least one set as done before saving, or discard this workout if you didn't train.", fixes: [] });
      return;
    }
    const exercises: DoneExercise[] = rows.map(({ p, e, pr, check }) => {
      const skipped = pr.skipped === true;
      return {
        exerciseId: p.exerciseId,
        setsDone: skipped ? 0 : Math.min(p.sets, pr.setsDone),
        setsPlanned: p.sets,
        weight: e.weighted && !skipped ? check.value : null,
        ...(pr.feedback && e.weighted ? { feedback: pr.feedback } : {}),
        ...(skipped ? { skipped: true } : {}),
      };
    });
    const note = w.note.trim();
    onSaved(saveWorkout({ date: today, unit: w.unit, key: w.planned.key, exercises, ...(note ? { note } : {}) }));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-lg text-muted">{workoutTitle(w.planned.key)}</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-none">{doneCount > 0 ? "Nice work" : "Finish workout"}</h1>
        <p className="mt-2 text-lg text-muted">
          About {minutes} {minutes === 1 ? "minute" : "minutes"} · {summary}. Check it over, then save.
        </p>
      </header>

      {problem && (
        <div ref={alertRef} tabIndex={-1} role="alert" className="border-2 border-danger bg-surface p-4">
          <p className="font-semibold text-danger">{problem.message}</p>
          {problem.fixes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {problem.fixes.map((f) => (
                <li key={f.index}>
                  <p className="text-sm">{f.error}</p>
                  <Button variant="secondary" className="mt-1 !min-h-11 !text-base" onClick={() => onGo(f.index)}>
                    Fix {f.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ol className="divide-y divide-line border-y border-line">
        {rows.map(({ p, index, e, pr }) => (
          <li key={p.exerciseId} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold">{e.name}</p>
              <p className="text-sm text-muted">
                {pr.skipped ? "Skipped, fitted in next time" : `${pr.setsDone} of ${p.sets} ${p.sets === 1 ? "set" : "sets"}`}
                {e.weighted && !pr.skipped && pr.weight.trim() ? ` · ${pr.weight.trim()} ${w.unit}` : ""}
                {pr.feedback && !pr.skipped ? ` · felt ${pr.feedback === "right" ? "just right" : pr.feedback}` : ""}
              </p>
            </div>
            <Button variant="ghost" className="flex-none" onClick={() => onGo(index)}>
              Change<span className="sr-only"> {e.name}</span>
            </Button>
          </li>
        ))}
      </ol>

      <Field id="workout-note" label="Notes" optional hint="Anything worth remembering, like a sore shoulder or a busy machine.">
        {(p) => <Textarea {...p} value={w.note} maxLength={MAX_NOTE} onChange={(ev) => onNote(ev.target.value)} />}
      </Field>

      <div className="flex flex-col gap-3">
        <Button variant="primary" onClick={save} className="w-full sm:w-auto sm:self-start">
          Save workout
        </Button>
        <div className="flex flex-wrap gap-x-2">
          <Button variant="ghost" onClick={() => onGo(w.planned.exercises.length - 1)}>
            ← Back to the exercises
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            Discard this workout
          </Button>
        </div>
      </div>
    </div>
  );
}
