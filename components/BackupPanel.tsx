"use client";

import { useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Field } from "./Field";
import { ConfirmDialog } from "./Modal";
import { MAX_BACKUP_BYTES, backupFileName, describeBackup, readBackup } from "@/lib/backup";
import type { Data } from "@/lib/data";
import { exportBackup, restoreFromBackup } from "@/lib/store";

/** Months of training live only in this browser, so give people a way to keep a copy. */
export function BackupPanel({ sessionCount }: { sessionCount: number }) {
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: Data; recovered: boolean; label: string } | null>(null);

  function download() {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setError(undefined);
    setDone(`Backup downloaded — your plan and ${sessionCount} ${sessionCount === 1 ? "workout" : "workouts"}. Keep the file somewhere safe.`);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still fires
    if (!file) return;
    setDone(null);
    if (file.size > MAX_BACKUP_BYTES) {
      setError("That file is too large to be an Ironlog backup. Choose the .json file you downloaded from Ironlog.");
      return;
    }
    const result = readBackup(await file.text());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setPending({ data: result.data, recovered: result.recovered, label: describeBackup(result.data) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button variant="secondary" onClick={download}>
          Download a backup
        </Button>
        <p className="mt-2 text-sm text-muted">A single .json file with your plan, every workout, your remembered weights and check-ins.</p>
      </div>

      <Field id="backup-file" label="Restore from a backup" hint="Choose a .json file you downloaded from Ironlog. You'll see what's in it before anything changes." error={error}>
        {(p) => (
          <input
            {...p}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="w-full text-base text-ink file:mr-4 file:min-h-12 file:cursor-pointer file:border-2 file:border-ink file:bg-transparent file:px-4 file:py-2 file:text-lg file:font-semibold file:text-ink hover:file:bg-ink hover:file:text-on-ink"
          />
        )}
      </Field>

      {done && <Banner tone="success" title={done} />}

      <ConfirmDialog
        open={pending !== null}
        title="Restore this backup?"
        body={
          pending
            ? `${pending.label} This replaces what's on this device now (${sessionCount} ${sessionCount === 1 ? "workout" : "workouts"}).${pending.recovered ? " Some unreadable parts of the file will be skipped." : ""}`
            : ""
        }
        confirmLabel="Restore backup"
        cancelLabel="Cancel"
        tone="primary"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            restoreFromBackup(pending.data);
            setDone("Backup restored.");
          }
          setPending(null);
        }}
      />
    </div>
  );
}
