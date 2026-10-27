import type { ReactNode } from "react";

/** An optional tool, closed until asked for: a native <details>, so it works with a keyboard and no script. */
export function Disclosure({ id, title, summary, children }: { id: string; title: string; summary: string; children: ReactNode }) {
  return (
    <details className="group border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <span>
          <h2 id={id} className="font-display text-2xl font-extrabold leading-tight">
            {title}
          </h2>
          <span className="mt-1 block text-muted">{summary}</span>
        </span>
        <span aria-hidden className="flex-none text-3xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none">
          +
        </span>
      </summary>
      <div className="border-t border-line p-5">{children}</div>
    </details>
  );
}
