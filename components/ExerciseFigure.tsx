"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { FIGURE_ALT, POSES, STROKE, VIEW_H, VIEW_W, easeInOut, poseAt, solvePose } from "@/lib/poses";
import type { Bone, Pose, Prim, Solved, Tone } from "@/lib/poses";

/** Looping demo of one exercise, drawn in SVG from joint angles (lib/poses.ts).
 *  - Renders nothing when the exercise has no pose, so callers never need to check.
 *  - `className` sizes it, e.g. "w-full max-w-sm" (it is always a block with automatic height;
 *    the default is the full width of its container).
 *  - It moves from the start pose to the finish pose and back, easing in and out with a short
 *    pause at each end, and stops while the tab is hidden.
 *  - With prefers-reduced-motion it does not animate: it shows the start and finish poses side
 *    by side, labelled "Start" and "Finish". */

const TONE: Record<Tone, string> = {
  field: "var(--field)",
  line: "var(--line)",
  text: "var(--text)",
};

/** Coordinates are rounded when drawn: the server and the browser run different math libraries, and
 *  their sin/cos can differ in the last bit, which would otherwise trip a hydration mismatch. */
const q = (n: number) => Math.round(n * 100) / 100;

/** seconds of movement per leg, and the pause at each end, in milliseconds */
const DEFAULT_MOVE_S = 1.5;
const HOLD_MS = 320;
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches;
const getReducedOnServer = () => false;

/** 0..1 position along start -> end -> start for a clock in [0, cycle). */
function progress(clock: number, move: number, hold: number): number {
  if (clock < hold) return 0;
  if (clock < hold + move) return easeInOut((clock - hold) / move);
  if (clock < 2 * hold + move) return 1;
  return 1 - easeInOut((clock - 2 * hold - move) / move);
}

function Shape({ p }: { p: Prim }) {
  const color = TONE[p.tone];
  if (p.kind === "line") {
    return (
      <line
        x1={q(p.a[0])}
        y1={q(p.a[1])}
        x2={q(p.b[0])}
        y2={q(p.b[1])}
        stroke={color}
        strokeWidth={p.width}
        strokeLinecap="round"
      />
    );
  }
  return (
    <circle
      cx={q(p.c[0])}
      cy={q(p.c[1])}
      r={p.r}
      fill={p.fill ? color : "none"}
      stroke={p.fill ? "none" : color}
      strokeWidth={p.width}
    />
  );
}

/** The drawing itself: equipment behind, far limbs dimmed, body, then held implements. */
export function FigureShapes({ solved }: { solved: Solved }) {
  const { joints, bones, headR, headGap, equipment } = solved;
  const maskId = `fig-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const bone = (b: Bone, i: number) => (
    <line key={i} x1={q(joints[b.from][0])} y1={q(joints[b.from][1])} x2={q(joints[b.to][0])} y2={q(joints[b.to][1])} />
  );
  const strokes = { stroke: "var(--text)", strokeWidth: STROKE, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  return (
    <>
      {/* limbs that cross the head get a small gap around it, so the head always reads as a round shape
          (a mask, not a painted outline, keeps the background transparent) */}
      {headGap > 0 ? (
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_W} height={VIEW_H}>
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="white" />
          <circle cx={q(joints.head[0])} cy={q(joints.head[1])} r={headR + headGap} fill="black" />
        </mask>
      ) : null}
      {equipment.map((p, i) => (p.layer === "back" ? <Shape key={`b${i}`} p={p} /> : null))}
      <g {...strokes} mask={headGap > 0 ? `url(#${maskId})` : undefined}>
        <g opacity={0.48}>{bones.filter((b) => b.side === "far").map(bone)}</g>
        {bones.filter((b) => b.side !== "far" && !b.arm && !(b.from === "shoulder" && b.to === "neck")).map(bone)}
        {bones.filter((b) => b.side !== "far" && b.arm).map(bone)}
      </g>
      <g {...strokes}>{bones.filter((b) => b.from === "shoulder" && b.to === "neck").map(bone)}</g>
      <circle cx={q(joints.head[0])} cy={q(joints.head[1])} r={headR} fill="var(--text)" />
      {equipment.map((p, i) => (p.layer === "front" ? <Shape key={`f${i}`} p={p} /> : null))}
    </>
  );
}

function StaticPose({ pose, label }: { pose: Pose; label: string }) {
  return (
    <figure className="m-0 min-w-0 flex-1" aria-hidden="true">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" className="block h-auto w-full">
        <FigureShapes solved={solvePose(pose)} />
      </svg>
      <figcaption className="text-center text-sm font-semibold text-muted">{label}</figcaption>
    </figure>
  );
}

export function ExerciseFigure({ exerciseId, className }: { exerciseId: string; className?: string }) {
  const set = Object.prototype.hasOwnProperty.call(POSES, exerciseId) ? POSES[exerciseId] : undefined;
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedOnServer);
  // Progress is kept together with the exercise it belongs to, so switching exercises restarts from the
  // start pose without having to reset state while rendering.
  const [frame, setFrame] = useState({ id: exerciseId, t: 0 });
  const t = frame.id === exerciseId ? frame.t : 0;

  useEffect(() => {
    if (!set || reduced) return;
    const move = (set.move ?? DEFAULT_MOVE_S) * 1000;
    const cycle = 2 * (move + HOLD_MS);
    let raf = 0;
    let last = 0;
    let clock = 0;
    const tick = (now: number) => {
      // accumulate (and cap) the step so a slow frame or a hidden tab never makes the figure jump
      const step = last ? Math.min(now - last, 100) : 0;
      last = now;
      clock = (clock + step) % cycle;
      const next = progress(clock, move, HOLD_MS);
      // returning the same object during a hold lets React skip the re-render
      setFrame((prev) => (prev.id === exerciseId && prev.t === next ? prev : { id: exerciseId, t: next }));
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [set, reduced, exerciseId]);

  if (!set) return null;
  const alt = FIGURE_ALT[exerciseId];

  if (reduced) {
    return (
      <div role="img" aria-label={alt} className={`flex gap-3 ${className ?? "w-full"}`}>
        <StaticPose pose={set.start} label="Start" />
        <StaticPose pose={set.end} label="Finish" />
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={alt}
      width="100%"
      className={`block h-auto ${className ?? "w-full"}`}
    >
      <FigureShapes solved={solvePose(poseAt(set, t))} />
    </svg>
  );
}
