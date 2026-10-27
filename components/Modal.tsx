"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

/**
 * Native <dialog>: showModal() makes the page inert and traps focus; Escape and
 * the backdrop close it; focus returns to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEvent = () => {
      const o = opener.current;
      if (o && document.contains(o)) o.focus();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("close", onCloseEvent);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("close", onCloseEvent);
      d.removeEventListener("click", onClick);
    };
  }, [onClose]);

  return (
    <dialog ref={ref} aria-labelledby={labelledBy} className="sheet">
      {children}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-title">
      <div className="p-6">
        <h2 id="confirm-title" className="font-display text-3xl font-extrabold">
          {title}
        </h2>
        <p className="mt-2 text-muted">{body}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
