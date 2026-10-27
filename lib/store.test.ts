import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createWriteQueue } from "./writeQueue.ts";
import * as data from "./data.ts";
import * as rows from "./rows.ts";
import * as adapt from "./adapt.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup() {
  const tokens: (() => Promise<string | null>)[] = [];
  const writes: { table: string; row: unknown }[] = [];
  let readGate: Promise<void> = Promise.resolve();
  const client = { from(table: string) {
    const query = {
      select() { return query; },
      maybeSingle() { return query; },
      order() { return query; },
      async then(resolve: (value: unknown) => void) {
        await readGate;
        resolve({ data: table === "profiles" ? null : [], error: null });
      },
      async upsert(row: unknown) { writes.push({ table, row }); return { error: null }; },
    };
    return query;
  } };
  const modules: Record<string, unknown> = {
    react: { useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot() },
    "./writeQueue": { createWriteQueue }, "./data": data, "./rows": rows, "./adapt": adapt,
    "./supabase": { createSupabase: (getToken: () => Promise<string | null>) => { tokens.push(getToken); return client; } },
    "./inprogress": { setInProgressOwner() {}, keepOnlyInProgress() {}, clearInProgress() {} },
    "./checkin": { checkinsIn: (v: unknown) => v },
  };
  const source = await readFile(new URL("./store.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (...args: never[]) => unknown> = {};
  runInNewContext(code, { exports, require: (id: string) => modules[id] ?? {}, crypto: globalThis.crypto, console, Date });
  const store = exports as unknown as typeof import("./store.ts");
  store.connect("user_a", async () => null);
  await tick();
  return { store, writes, tokens, holdReads: (gate: Promise<void>) => { readGate = gate; } };
}

it("captures each profile write and preserves the workout draft's unit", async () => {
  const { store, writes } = await setup();
  store.chooseLook("balanced");
  store.setUnit("kg");
  store.saveWorkout({ date: "2026-10-27", key: "A", unit: "lb", exercises: [] });
  await tick();
  const profiles = writes.filter((w) => w.table === "profiles").map((w) => (w.row as { unit: string }).unit);
  assert.deepEqual(profiles, ["lb", "kg", "kg"]);
  assert.equal((writes.find((w) => w.table === "workouts")!.row as { unit: string }).unit, "lb");
});

it("drops a refresh that overlaps a local edit and forgets data on user switching", async () => {
  const { store, holdReads } = await setup();
  let release!: () => void;
  holdReads(new Promise<void>((resolve) => { release = resolve; }));
  store.refresh();
  store.chooseLook("balanced");
  release();
  await tick();
  assert.equal(store.useIronlog().data.profile?.lookId, "balanced");
  store.connect("user_b", async () => null);
  assert.equal(store.useIronlog().ready, false);
  assert.equal(store.useIronlog().data.profile, null);
  await tick();
  assert.equal(store.useIronlog().data.profile, null);
});

it("never gives an old client the next account's token, including a late token reply", async () => {
  const { store, tokens } = await setup();
  store.connect("user_b", async () => "token_b");
  await assert.rejects(tokens[0], /Account changed/);
  assert.equal(await tokens[1](), "token_b");
  let release!: (token: string) => void;
  store.connect("user_c", () => new Promise<string>((resolve) => { release = resolve; }));
  const late = tokens[2]();
  store.disconnect();
  release("token_c");
  await assert.rejects(late, /Account changed/);
});
