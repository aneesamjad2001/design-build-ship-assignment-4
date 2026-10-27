"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "./Banner";
import { Button, ButtonLink } from "./Button";
import { Field, Input, Select, Textarea } from "./Field";
import { LoadingState } from "./States";
import { MAX_SAVED_NOTE, validateNote } from "@/lib/saved";
import type { SavedExercise } from "@/lib/saved";
import { removeSaved, restoreSaved, saveExercise, setSavedNote, useIronlog } from "@/lib/store";
import { EQUIPMENT, MUSCLES, PAGE_LIMIT, matchName } from "@/lib/wger";
import type { WgerExercise } from "@/lib/wger";

type Browse =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "ok"; exercises: WgerExercise[]; total: number; label: string }
  | { state: "error"; reason: "down" | "bad-filter" | "signed-out" };

const nameOf = (list: readonly { id: number; name: string }[], id: string) => list.find((x) => String(x.id) === id)?.name;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ExercisesView() {
  const snap = useIronlog();
  if (!snap.ready) return <LoadingState />;
  return <Library saved={snap.saved} />;
}

/** The wger library: browse by muscle and equipment (wger can't search by name), narrow by
 *  name here, and save exercises with a note. Saving never changes the plan. */
function Library({ saved }: { saved: SavedExercise[] }) {
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [name, setName] = useState("");
  const [filterError, setFilterError] = useState<string>();
  const [result, setResult] = useState<Browse>({ state: "idle" });
  const [undo, setUndo] = useState<SavedExercise | null>(null);
  const request = useRef<AbortController | null>(null);
  const last = useRef({ muscle: "", equipment: "" });
  const savedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => request.current?.abort(), []);

  const savedIds = new Set(saved.map((s) => s.wgerId));

  async function load(m: string, e: string) {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    last.current = { muscle: m, equipment: e };
    const label = [nameOf(MUSCLES, m), nameOf(EQUIPMENT, e)].filter(Boolean).join(" + ");
    setResult({ state: "loading", label });
    const q = new URLSearchParams();
    if (m) q.set("muscle", m);
    if (e) q.set("equipment", e);
    try {
      const res = await fetch(`/api/exercises?${q}`, { signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (res.status === 401) setResult({ state: "error", reason: "signed-out" });
      else if (res.ok && body?.ok) setResult({ state: "ok", exercises: body.exercises, total: body.total, label });
      else setResult({ state: "error", reason: res.status === 400 ? "bad-filter" : "down" });
    } catch {
      if (!ctrl.signal.aborted) setResult({ state: "error", reason: "down" });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!muscle && !equipment) {
      setFilterError("Pick a muscle or a piece of equipment. wger can't search by name alone.");
      document.getElementById("lib-muscle")?.focus();
      return;
    }
    setFilterError(undefined);
    void load(muscle, equipment);
  }

  function remove(wgerId: number, fromSavedList: boolean) {
    setUndo(removeSaved(wgerId));
    // the row that had focus is gone; land on its list instead of the top of the page
    if (fromSavedList) savedHeading.current?.focus();
  }

  const shown = result.state === "ok" ? matchName(result.exercises, name) : [];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-5xl font-black leading-none">Exercise library</h1>
        <p className="mt-2 max-w-prose text-muted">
          Browse exercises from wger, a free and open exercise database, and save the ones you want to remember. It&apos;s a reference list: saving
          an exercise doesn&apos;t change your plan.
        </p>
        {saved.length > 0 && (
          <a href="#saved" className="mt-3 inline-block font-semibold underline underline-offset-4">
            Your saved exercises ({saved.length})
          </a>
        )}
      </header>


      <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-labelledby="find-heading">
        <h2 id="find-heading" className="font-display text-3xl font-extrabold">
          Find exercises
        </h2>
        <Field id="lib-muscle" label="Muscle" error={filterError}>
          {(p) => (
            <Select
              {...p}
              value={muscle}
              invalid={!!filterError}
              onChange={(e) => {
                setMuscle(e.target.value);
                setFilterError(undefined);
              }}
            >
              <option value="">Any muscle</option>
              {MUSCLES.map((m) => (
                <option key={m.id} value={m.id}>
                  {"where" in m ? `${m.name} (${m.where})` : m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="lib-equipment" label="Equipment">
          {(p) => (
            <Select
              {...p}
              value={equipment}
              onChange={(e) => {
                setEquipment(e.target.value);
                setFilterError(undefined);
              }}
            >
              <option value="">Any equipment</option>
              {EQUIPMENT.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="lib-name" label="Name contains" optional hint="Narrows the results below as you type, e.g. “press” or “curl”.">
          {(p) => <Input {...p} type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
          Show exercises
        </Button>
      </form>

      {result.state !== "idle" && (
        <section aria-labelledby="results-heading" className="flex flex-col gap-4">
          <h2 id="results-heading" className="font-display text-3xl font-extrabold">
            Results
          </h2>
          <Results result={result} shown={shown} name={name} onClearName={() => setName("")} onRetry={() => void load(last.current.muscle, last.current.equipment)} />
          {shown.length > 0 && (
            <ul className="flex flex-col gap-4">
              {shown.map((ex) => (
                <ExerciseCard key={ex.id} ex={ex} isSaved={savedIds.has(ex.id)} onSave={() => saveExercise(ex)} onRemove={() => remove(ex.id, false)} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="saved" aria-labelledby="saved-heading" className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 id="saved-heading" ref={savedHeading} tabIndex={-1} className="font-display text-3xl font-extrabold">
          Your saved exercises
        </h2>
        {undo && (
          <Banner
            tone="info"
            title={`${undo.name} removed from your saved exercises`}
            action={
              <Button
                variant="secondary"
                className="!min-h-11 !text-base"
                onClick={() => {
                  restoreSaved(undo);
                  setUndo(null);
                }}
              >
                Undo
              </Button>
            }
          />
        )}
        {saved.length === 0 ? (
          <p className="text-muted">Nothing saved yet. Save exercises from the results to keep them here with your own notes.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {saved.map((s) => (
              <SavedItem key={s.wgerId} s={s} onRemove={() => remove(s.wgerId, true)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Results({
  result,
  shown,
  name,
  onClearName,
  onRetry,
}: {
  result: Exclude<Browse, { state: "idle" }>;
  shown: WgerExercise[];
  name: string;
  onClearName: () => void;
  onRetry: () => void;
}) {
  if (result.state === "loading") {
    return (
      <p role="status" aria-busy="true" className="text-lg text-muted">
        Loading {result.label} exercises from wger…
      </p>
    );
  }
  if (result.state === "error") {
    if (result.reason === "signed-out") {
      return (
        <Banner tone="warning" title="You've been signed out" action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}>
          Sign in again to browse the library.
        </Banner>
      );
    }
    if (result.reason === "bad-filter") {
      return (
        <Banner tone="warning" title="wger didn't recognise that filter">
          Pick a muscle or equipment from the lists above and try again.
        </Banner>
      );
    }
    return (
      <Banner tone="warning" title="wger isn't answering right now" action={<Button onClick={onRetry}>Try again</Button>}>
        The library comes from wger.de, a free service that&apos;s sometimes slow or down. Your saved exercises below are still here.
      </Banner>
    );
  }
  const q = name.trim();
  if (result.total === 0 || result.exercises.length === 0) {
    return (
      <p role="status" className="text-lg">
        wger has no exercises for {result.label}. Try &ldquo;Any equipment&rdquo;, or a different muscle.
      </p>
    );
  }
  if (shown.length === 0) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p className="text-lg">
          None of the {plural(result.exercises.length, `${result.label} exercise`, `${result.label} exercises`)} have &ldquo;{q}&rdquo; in the name.
        </p>
        <Button onClick={onClearName}>Clear the name</Button>
      </div>
    );
  }
  return (
    <p role="status" className="text-lg">
      {plural(shown.length, "exercise", "exercises")} for {result.label}
      {q ? <> with &ldquo;{q}&rdquo; in the name</> : null}.
      {result.total > PAGE_LIMIT && (
        <span className="text-muted">
          {" "}
          wger has {result.total}; these are the first {PAGE_LIMIT}. Pick equipment too to narrow it down.
        </span>
      )}
    </p>
  );
}

function Thumb({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div aria-hidden className="flex h-24 w-24 flex-none items-center justify-center border border-line bg-raised p-2 text-center text-sm text-muted">
        No photo on wger
      </div>
    );
  }
  return (
    // a plain img: wger's photos are shown as-is, so there's nothing for next/image to optimise
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${name}, photo from wger`} loading="lazy" onError={() => setBroken(true)} className="h-24 w-24 flex-none border border-line bg-white object-contain" />
  );
}

function ExerciseCard({ ex, isSaved, onSave, onRemove }: { ex: WgerExercise; isSaved: boolean; onSave: () => void; onRemove: () => void }) {
  return (
    <li className="flex flex-col gap-3 border border-line bg-surface p-4">
      <div className="flex gap-4">
        <Thumb url={ex.imageUrl} name={ex.name} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl font-extrabold leading-tight">{ex.name}</h3>
          <p className="mt-1 text-sm text-muted">
            {ex.muscles.length > 0 ? `Works ${ex.muscles.join(", ")}` : ex.category ? `Category: ${ex.category}` : "Muscles not listed"}
            {ex.musclesSecondary.length > 0 && `; also ${ex.musclesSecondary.join(", ")}`}
          </p>
          <p className="text-sm text-muted">{ex.equipment.length > 0 ? `Uses ${ex.equipment.join(", ")}` : "No equipment listed"}</p>
        </div>
      </div>
      {ex.description ? (
        <details>
          <summary className="cursor-pointer font-semibold">How to do it</summary>
          {/* plain text: wger's HTML was stripped on our server and is never rendered as HTML */}
          <p className="mt-2 max-w-prose whitespace-pre-line text-muted">{ex.description}</p>
        </details>
      ) : (
        <p className="text-sm text-muted">wger has no written steps for this one yet.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          From{" "}
          <a href="https://wger.de" className="underline underline-offset-2" target="_blank" rel="noreferrer">
            wger.de
          </a>{" "}
          · {ex.license}
          {ex.author && ` · by ${ex.author}`}
        </p>
        <Button variant={isSaved ? "ghost" : "secondary"} aria-pressed={isSaved} onClick={isSaved ? onRemove : onSave}>
          {isSaved ? "✓ Saved — remove" : "Save"}
          <span className="sr-only"> {ex.name}</span>
        </Button>
      </div>
    </li>
  );
}

function SavedItem({ s, onRemove }: { s: SavedExercise; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.note);
  const [error, setError] = useState<string>();
  const editButton = useRef<HTMLButtonElement>(null);
  const id = `note-${s.wgerId}`;

  function close() {
    setEditing(false);
    setError(undefined);
    // back to the button that opened the form, for keyboard users
    setTimeout(() => editButton.current?.focus(), 0);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateNote(text);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setSavedNote(s.wgerId, r.note);
    setText(r.note);
    close();
  }

  const details = [s.muscles.length ? `Works ${s.muscles.join(", ")}` : "", s.equipment.length ? `Uses ${s.equipment.join(", ")}` : ""].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-3 py-4">
      <div>
        <p className="text-lg font-semibold">{s.name}</p>
        {details && <p className="text-sm text-muted">{details}</p>}
        {s.note && !editing && <p className="mt-2 max-w-prose whitespace-pre-line">Your note: {s.note}</p>}
      </div>
      {editing ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <Field id={id} label={`Note for ${s.name}`} hint={`Up to ${MAX_SAVED_NOTE} characters, e.g. which weight or machine setting works for you.`} error={error}>
            {(p) => (
              <Textarea
                {...p}
                autoFocus
                value={text}
                invalid={!!error}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(undefined);
                }}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Save note</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setText(s.note);
                close();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button ref={editButton} onClick={() => setEditing(true)}>
            {s.note ? "Edit note" : "Add a note"}
            <span className="sr-only"> for {s.name}</span>
          </Button>
          <Button variant="ghost" onClick={onRemove}>
            Remove<span className="sr-only"> {s.name}</span>
          </Button>
        </div>
      )}
    </li>
  );
}
