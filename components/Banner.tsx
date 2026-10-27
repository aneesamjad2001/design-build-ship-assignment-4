import type { ReactNode } from "react";

/** Inline status messages: saved, can't-save, recovered data. Always carries
 *  a text label and a symbol, never color alone. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "success" | "warning";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const symbol = tone === "success" ? "✓" : tone === "warning" ? "!" : "i";
  const border = tone === "warning" ? "border-danger" : tone === "success" ? "border-ink" : "border-line";
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={`flex items-start gap-3 border-l-4 ${border} bg-surface px-4 py-3`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm font-black ${
          tone === "warning" ? "bg-danger text-on-danger" : "bg-ink text-on-ink"
        }`}
      >
        {symbol}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        {children && <p className="mt-0.5 text-sm text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}
