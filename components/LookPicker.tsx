"use client";

import { FieldError } from "./Field";
import { Silhouette } from "./Silhouette";
import { LOOKS, LOOK_NOTE } from "@/lib/looks";
import type { LookId } from "@/lib/looks";

/** Real radio inputs, so arrow keys and screen readers just work. Selected is an
 *  ink fill (not the accent colour, which stays reserved for the next action). */
const tile =
  "group relative flex cursor-pointer flex-col items-center gap-1 border-2 border-field bg-surface px-3 pb-4 pt-3 text-center transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-on-ink has-[:focus-visible]:transition-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

export function LookPicker({
  value,
  onChange,
  error,
  legend = "What body are you aiming for?",
  showNote = true,
}: {
  value: LookId | null;
  onChange: (id: LookId) => void;
  error?: string;
  legend?: string;
  showNote?: boolean;
}) {
  return (
    <fieldset aria-describedby={error ? "look-error" : undefined}>
      <legend className="mb-3 font-display text-3xl font-extrabold">{legend}</legend>
      {error && (
        <div className="mb-3">
          <FieldError id="look-error">{error}</FieldError>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LOOKS.map((l) => (
          <label key={l.id} className={tile}>
            <input type="radio" name="look" value={l.id} checked={value === l.id} onChange={() => onChange(l.id)} className="sr-only" />
            <Silhouette shape={l.shape} className="h-28 w-auto" />
            <span className="font-display text-xl font-extrabold leading-tight">{l.name}</span>
            <span className="text-sm font-semibold">{l.tagline}</span>
            <span className="text-sm text-muted group-has-[:checked]:text-on-ink-muted">{l.description}</span>
            <span aria-hidden className="hidden text-sm font-semibold group-has-[:checked]:block">
              ✓ Selected
            </span>
          </label>
        ))}
      </div>
      {showNote && <p className="mt-3 max-w-prose text-sm text-muted">{LOOK_NOTE}</p>}
    </fieldset>
  );
}
