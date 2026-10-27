import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/**
 * A labeled form field: label above, optional hint, and the error right under
 * the control saying what to do next. The control is rendered by the caller so
 * it can be an input or a select, but always gets the label/error wiring.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: (props: ControlProps) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-semibold text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 text-base font-medium text-danger">
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-danger text-sm font-black text-on-danger"
      >
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

const control =
  "min-h-12 w-full border-2 bg-surface px-3 py-2 text-lg text-ink placeholder:italic placeholder:text-muted disabled:opacity-50";

export function Input({ invalid, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`${control} ${invalid ? "border-danger" : "border-field"} ${className}`} {...props} />;
}

export function Textarea({ invalid, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`${control} min-h-24 ${invalid ? "border-danger" : "border-field"} ${className}`} {...props} />;
}

export function Select({ invalid, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={`${control} ${invalid ? "border-danger" : "border-field"} ${className}`} {...props} />;
}
