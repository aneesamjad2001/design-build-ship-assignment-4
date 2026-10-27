"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

const PRESETS = [60, 90, 120, 180];
/** The wall clock, read only from event handlers and timers — never during render. */
const nowMs = () => Date.now();
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* sound is a nicety; the visual and the vibration still happen */
  }
}

type Phase = { kind: "idle" } | { kind: "running"; endsAt: number; total: number } | { kind: "done" };

/**
 * One tap starts a rest. It counts against the clock rather than ticking, so a
 * locked phone or a backgrounded tab still shows the right time when you return.
 * When it ends: vibration, a short beep, and a message — never sound alone.
 */
export function RestTimer({ request, className = "bottom-14 md:bottom-0" }: { request?: { seconds: number; id: number } | null; className?: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [now, setNow] = useState(0);

  const running = phase.kind === "running" ? phase : null;
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = nowMs();
      setNow(t);
      if (t >= running.endsAt) {
        setPhase({ kind: "done" });
        navigator.vibrate?.([200, 100, 200]);
        beep();
      }
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running]);

  const start = (seconds: number) => {
    const t = nowMs();
    setNow(t);
    setPhase({ kind: "running", endsAt: t + seconds * 1000, total: seconds });
  };

  // a new request (e.g. a set was just completed) starts a rest; deferred so no state is set synchronously in the effect
  const requestId = request?.id;
  const requestSeconds = request?.seconds;
  useEffect(() => {
    if (requestId === undefined || requestSeconds === undefined) return;
    const t = setTimeout(() => {
      const n = nowMs();
      setNow(n);
      setPhase({ kind: "running", endsAt: n + requestSeconds * 1000, total: requestSeconds });
    }, 0);
    return () => clearTimeout(t);
  }, [requestId, requestSeconds]);
  const remaining = running ? Math.max(0, Math.ceil((running.endsAt - now) / 1000)) : 0;

  return (
    <section aria-label="Rest timer" className={`fixed inset-x-0 z-20 ${className}`}>
      <div className="mx-auto max-w-2xl px-3 pb-2">
        <div className="relative overflow-hidden border-2 border-line bg-raised p-2 shadow-[0_8px_24px_var(--backdrop)]">
          {phase.kind === "idle" && (
            <div className="flex items-center gap-2">
              <span className="px-1 text-lg font-semibold text-muted">Rest</span>
              <div className="grid flex-1 grid-cols-4 gap-2">
                {PRESETS.map((s) => (
                  <Button key={s} variant="secondary" onClick={() => start(s)} aria-label={`Start a ${clock(s)} rest`} className="!min-h-11 !px-0 !text-base">
                    {clock(s)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {running && (
            <div className="flex items-center gap-3">
              <p role="timer" aria-live="off" className="min-w-[4.5rem] px-1 font-stencil text-4xl font-black leading-none">
                {clock(remaining)}
              </p>
              <div className="h-2 flex-1 bg-line" aria-hidden>
                <div className="h-full bg-ink transition-[width] duration-200 ease-linear" style={{ width: `${(remaining / running.total) * 100}%` }} />
              </div>
              <Button variant="secondary" onClick={() => start(remaining + 30)} className="!min-h-11 !px-3 !text-base" aria-label="+30s: add 30 seconds">
                +30s
              </Button>
              <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })} className="!min-h-11 !px-2 !text-base">
                Skip
              </Button>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="flex items-center justify-between gap-3">
              <p className="px-1 font-display text-2xl font-extrabold">Rest over — next set</p>
              <Button variant="secondary" onClick={() => setPhase({ kind: "idle" })} className="!min-h-11 !text-base">
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
      <p role="status" className="sr-only">
        {phase.kind === "done" ? "Rest over. Time for your next set." : running ? `Resting for ${clock(running.total)}.` : ""}
      </p>
    </section>
  );
}
