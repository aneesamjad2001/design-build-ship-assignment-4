"use client";

/**
 * Your data, from your account, as a small external store.
 *
 * Supabase is the source of truth. After sign-in, connect() loads this person's rows
 * (row-level security returns only theirs) and screens read them through useIronlog().
 * Changes show at once and are written in order behind the scenes; if a write fails it
 * is kept, the app says so, and "Try again" re-sends it, so nothing typed is lost.
 * Every write is safe to repeat (upserts by id, deletes by id).
 *
 * What is stored is never rewritten when the unit changes: every workout, weight
 * and check-in keeps the unit it was entered in, and is converted for display only.
 */

import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBackup } from "./backup";
import { checkinsIn } from "./checkin";
import type { Checkin } from "./checkin";
import { todayString } from "./dates";
import { EMPTY_DATA, weightsIn, workoutsIn } from "./data";
import type { Data, Loaded, Profile } from "./data";
import { updateBook } from "./adapt";
import type { CompletedWorkout, Unit } from "./adapt";
import { clearInProgress, keepOnlyInProgress, setInProgressOwner } from "./inprogress";
import type { LookId } from "./looks";
import type { NutritionProfile } from "./nutrition";
import { CHECKIN_COLUMNS, PROFILE_COLUMNS, WORKOUT_COLUMNS, checkinRow, fromRows, profileRow, workoutRow } from "./rows";
import type { CheckinRow, ProfileRow, WorkoutRow } from "./rows";
import { createSupabase } from "./supabase";
import type { TimeOption } from "./workouts";

export interface Snapshot {
  /** false until this person's data has loaded (server render, first paint, signed out) */
  ready: boolean;
  /** what the app shows: weights and measurements converted to the profile's unit */
  data: Data;
  /** something unreadable in the account was skipped */
  recovered: boolean;
  /** the data couldn't be loaded; retryLoad() tries again */
  loadFailed: boolean;
  /** a change couldn't be saved; it is kept here and retrySaves() re-sends it */
  saveFailed: boolean;
}

interface State {
  userId: string | null;
  ready: boolean;
  loadFailed: boolean;
  saveFailed: boolean;
  recovered: boolean;
  /** what is actually stored, never the converted view */
  stored: Data;
}

const SIGNED_OUT: State = { userId: null, ready: false, loadFailed: false, saveFailed: false, recovered: false, stored: EMPTY_DATA };
const LOADING: Snapshot = { ready: false, data: EMPTY_DATA, recovered: false, loadFailed: false, saveFailed: false };

let state: State = SIGNED_OUT;
let cacheFor: State | null = null;
let cache: Snapshot = LOADING;
const listeners = new Set<() => void>();

function getSnapshot(): Snapshot {
  if (cacheFor === state) return cache;
  cacheFor = state;
  const data = state.stored;
  const unit = data.profile?.unit;
  const shown: Data = unit
    ? { ...data, workouts: workoutsIn(data.workouts, unit), weights: weightsIn(data.weights, unit), checkins: checkinsIn(data.checkins, unit) }
    : data;
  cache = { ready: state.ready, data: shown, recovered: state.recovered, loadFailed: state.loadFailed, saveFailed: state.saveFailed };
  return cache;
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useIronlog(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => LOADING);
}

/** The stored data, for writing back. Never the converted view. */
const current = (): Data => state.stored;

/* ---- the connection to Supabase ---- */

type Op = (db: SupabaseClient) => Promise<void>;

let db: SupabaseClient | null = null;
/** bumps on every sign-in and sign-out, so a late reply for the previous person is dropped */
let session = 0;
/** bumps on every local change, so a refresh that started before it never overwrites it */
let edits = 0;
let queue: Promise<void> = Promise.resolve();
let pending = 0;
/** writes that failed, in order; later writes wait behind them */
let failed: Op[] = [];

const ok = ({ error }: { error: unknown }) => {
  if (error) throw error;
};
const messageOf = (e: unknown) => (e && typeof e === "object" && "message" in e ? String(e.message) : String(e));

function resetConnection() {
  session++;
  failed = [];
  pending = 0;
  queue = Promise.resolve();
}

/** Called when Clerk reports who is signed in. Loads that person's data. */
export function connect(userId: string, getToken: () => Promise<string | null>) {
  if (state.userId === userId && db) return;
  resetConnection();
  setInProgressOwner(userId);
  keepOnlyInProgress(userId);
  try {
    db = createSupabase(getToken);
  } catch (e) {
    db = null;
    console.error(messageOf(e));
    state = { ...SIGNED_OUT, userId, loadFailed: true };
    listeners.forEach((l) => l());
    return;
  }
  state = { ...SIGNED_OUT, userId };
  listeners.forEach((l) => l());
  void load();
}

/** Called on sign-out: forget everything held for the previous person, including in-progress drafts. */
export function disconnect() {
  resetConnection();
  db = null;
  setInProgressOwner(null);
  keepOnlyInProgress(null);
  state = SIGNED_OUT;
  listeners.forEach((l) => l());
}

async function fetchAll(client: SupabaseClient): Promise<Loaded> {
  const [p, w, c] = await Promise.all([
    client.from("profiles").select(PROFILE_COLUMNS).maybeSingle(),
    client.from("workouts").select(WORKOUT_COLUMNS).order("date"),
    client.from("checkins").select(CHECKIN_COLUMNS).order("date"),
  ]);
  [p, w, c].forEach(ok);
  return fromRows((p.data as ProfileRow | null) ?? null, (w.data as WorkoutRow[] | null) ?? [], (c.data as CheckinRow[] | null) ?? []);
}

async function load() {
  const client = db;
  const s = session;
  const e = edits;
  if (!client) return;
  try {
    const loaded = await fetchAll(client);
    if (s !== session || (state.ready && e !== edits)) return;
    set({ ready: true, loadFailed: false, stored: loaded.data, recovered: loaded.recovered });
  } catch (err) {
    if (s !== session) return;
    console.error("Loading from Supabase failed:", messageOf(err));
    if (!state.ready) set({ loadFailed: true });
  }
}

export function retryLoad() {
  if (!db) return;
  set({ loadFailed: false });
  void load();
}

/** Pick up changes made in another tab or on another device, when nothing here is waiting to save. */
export function refresh() {
  if (db && state.ready && pending === 0 && failed.length === 0) void load();
}

function enqueue(op: Op) {
  const client = db;
  const s = session;
  if (!client) return;
  pending++;
  queue = queue
    .then(async () => {
      if (s !== session) return;
      if (failed.length > 0) {
        failed.push(op);
        return;
      }
      try {
        await op(client);
      } catch (err) {
        if (s !== session) return;
        console.error("Saving to Supabase failed:", messageOf(err));
        failed.push(op);
        set({ saveFailed: true });
      }
    })
    .finally(() => {
      if (s === session) pending--;
    });
}

/** Re-send every change that failed, in the order it was made. */
export function retrySaves() {
  const ops = failed;
  failed = [];
  set({ saveFailed: false });
  ops.forEach(enqueue);
}

function commit(stored: Data, ...ops: Op[]) {
  edits++;
  set({ stored });
  ops.forEach(enqueue);
}

/* ---- writes: each one is safe to repeat ---- */

const saveProfile: Op = async (c) => {
  const row = profileRow(current());
  if (row) ok(await c.from("profiles").upsert(row, { onConflict: "user_id" }));
};
const putWorkout = (w: CompletedWorkout): Op => async (c) => ok(await c.from("workouts").upsert(workoutRow(w)));
const dropWorkout = (id: string): Op => async (c) => ok(await c.from("workouts").delete().eq("id", id));
const putCheckin = (x: Checkin): Op => async (c) => ok(await c.from("checkins").upsert(checkinRow(x)));
const dropCheckin = (id: string): Op => async (c) => ok(await c.from("checkins").delete().eq("id", id));
/** RLS limits a delete to the caller's rows; the filter is only there because the client requires one. */
const dropAll: Op = async (c) => {
  ok(await c.from("workouts").delete().not("id", "is", null));
  ok(await c.from("checkins").delete().not("id", "is", null));
  ok(await c.from("profiles").delete().not("user_id", "is", null));
};

/** Row ids are uuids, and they are global, so every new row gets a fresh one. */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** First pick creates the profile; later picks just change the look. */
export function chooseLook(lookId: LookId) {
  const d = current();
  const profile: Profile = d.profile ? { ...d.profile, lookId } : { lookId, time: "standard", unit: "lb", createdAt: Date.now() };
  commit({ ...d, profile }, saveProfile);
}

export function updateProfile(patch: Partial<Pick<Profile, "time" | "unit">>) {
  const d = current();
  if (!d.profile) return;
  commit({ ...d, profile: { ...d.profile, ...patch } }, saveProfile);
}

export function setTime(time: TimeOption) {
  updateProfile({ time });
}

export function setUnit(unit: Unit) {
  updateProfile({ unit });
}

/** Save a finished workout and fold its weights and feedback into the memory. */
export function saveWorkout(w: Omit<CompletedWorkout, "id" | "createdAt" | "unit">): CompletedWorkout {
  const d = current();
  const unit = d.profile?.unit ?? "lb";
  const workout: CompletedWorkout = { ...w, id: newId(), createdAt: Date.now(), unit };
  commit({ ...d, workouts: [...d.workouts, workout], weights: updateBook(d.weights, workout) }, putWorkout(workout), saveProfile);
  return workout;
}

/** Remove a workout and hand back exactly what was stored, so it can be restored. */
export function deleteWorkout(id: string): CompletedWorkout | null {
  const d = current();
  const removed = d.workouts.find((w) => w.id === id) ?? null;
  commit({ ...d, workouts: d.workouts.filter((w) => w.id !== id) }, dropWorkout(id));
  return removed;
}

export function restoreWorkout(w: CompletedWorkout) {
  const d = current();
  if (d.workouts.some((x) => x.id === w.id)) return;
  commit({ ...d, workouts: [...d.workouts, w] }, putWorkout(w));
}

export function addCheckin(values: Omit<Checkin, "id" | "createdAt" | "unit">): Checkin {
  const d = current();
  const c: Checkin = { ...values, id: newId(), createdAt: Date.now(), unit: d.profile?.unit ?? "lb" };
  commit({ ...d, checkins: [...d.checkins, c] }, putCheckin(c));
  return c;
}

export function deleteCheckin(id: string): Checkin | null {
  const d = current();
  const removed = d.checkins.find((c) => c.id === id) ?? null;
  commit({ ...d, checkins: d.checkins.filter((c) => c.id !== id) }, dropCheckin(id));
  return removed;
}

export function restoreCheckin(c: Checkin) {
  const d = current();
  if (d.checkins.some((x) => x.id === c.id)) return;
  commit({ ...d, checkins: [...d.checkins, c] }, putCheckin(c));
}

export function saveNutrition(profile: NutritionProfile | null) {
  const d = current();
  commit({ ...d, nutrition: profile }, saveProfile);
}

/** Erase this person's plan, workouts, check-ins and weights from their account. */
export function resetAll() {
  clearInProgress();
  commit(EMPTY_DATA, dropAll);
}

/** The stored data as a downloadable backup (weights in the unit each was entered in). */
export function exportBackup(): string {
  return buildBackup(current());
}

/** Replace everything in the account with a validated backup. Rows get fresh ids:
 *  a backup's ids may not be uuids, and the same file could be restored into two accounts. */
export function restoreFromBackup(data: Data) {
  const fresh: Data = {
    ...data,
    workouts: data.workouts.map((w) => ({ ...w, id: newId() })),
    checkins: data.checkins.map((c) => ({ ...c, id: newId() })),
  };
  commit(fresh, async (c) => {
    ok(await c.from("workouts").delete().not("id", "is", null));
    ok(await c.from("checkins").delete().not("id", "is", null));
    const row = profileRow(fresh);
    if (row) ok(await c.from("profiles").upsert(row, { onConflict: "user_id" }));
    if (fresh.workouts.length) ok(await c.from("workouts").upsert(fresh.workouts.map(workoutRow)));
    if (fresh.checkins.length) ok(await c.from("checkins").upsert(fresh.checkins.map(checkinRow)));
  });
}

/* "Today" that stays right when a tab is left open, including past midnight. */
function subscribeToday(cb: () => void): () => void {
  const onVisible = () => document.visibilityState === "visible" && cb();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", cb);
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(() => {
      cb();
      schedule();
    }, midnight.getTime() - now.getTime());
  };
  schedule();
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", cb);
  };
}

export function useToday(): string {
  return useSyncExternalStore(subscribeToday, () => todayString(), () => "");
}

/* A one-shot message handed from one screen to the next, e.g. "Workout saved". */
export interface Flash {
  title: string;
  detail?: string;
  /** the page that should show it */
  path: string;
}

let flash: Flash | null = null;
const flashListeners = new Set<() => void>();

export function getFlash(): Flash | null {
  return flash;
}

export function setFlash(f: Flash | null) {
  flash = f;
  flashListeners.forEach((l) => l());
}

export function useFlash(): Flash | null {
  return useSyncExternalStore(
    (cb) => {
      flashListeners.add(cb);
      return () => flashListeners.delete(cb);
    },
    () => flash,
    () => null,
  );
}
