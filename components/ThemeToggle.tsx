"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_KEY, THEME_LABEL, nextThemePref, parseThemePref } from "@/lib/theme";
import type { ThemePref } from "@/lib/theme";

/* The saved choice, read from localStorage (with an in-memory fallback when the
   browser blocks storage) and shared with other tabs through the storage event. */
let memory: ThemePref | null = null;
const listeners = new Set<() => void>();

function read(): ThemePref {
  if (memory) return memory;
  try {
    return parseThemePref(window.localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function apply(p: ThemePref) {
  const root = document.documentElement;
  if (p === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", p);
}

function save(p: ThemePref) {
  memory = p;
  try {
    if (p === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, p);
    memory = null;
  } catch {
    /* blocked storage: the choice lasts for this tab only */
  }
  apply(p);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return;
    apply(read());
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function Icon({ pref }: { pref: ThemePref }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 flex-none" aria-hidden>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      {pref === "system" && <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />}
      {pref === "dark" && <circle cx="10" cy="10" r="7" fill="currentColor" />}
    </svg>
  );
}

/** One button that says which theme is on and moves to the next:
 *  System (follows the device) → Light → Dark. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as ThemePref);

  // React's dev-mode remount resets attributes on <html>, clearing the one the inline
  // script set; put it back before paint. A no-op in production.
  useLayoutEffect(() => apply(read()), []);

  const next = nextThemePref(pref);
  return (
    <button
      type="button"
      onClick={() => save(next)}
      title={`Switch to ${THEME_LABEL[next].toLowerCase()}${next === "system" ? " (follow this device)" : ""}`}
      className="flex min-h-11 items-center gap-2 whitespace-nowrap px-2 text-base font-semibold text-muted hover:text-ink"
    >
      <Icon pref={pref} />
      <span>Theme: {THEME_LABEL[pref]}</span>
    </button>
  );
}
