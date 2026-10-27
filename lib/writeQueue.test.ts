import assert from "node:assert/strict";
import { it } from "node:test";
import { createWriteQueue } from "./writeQueue.ts";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

it("retries the failed head before newer writes, including writes already waiting", async () => {
  const calls: string[] = [];
  let reject!: (e: Error) => void;
  let first = true;
  const q = createWriteQueue(() => {});
  q.enqueue(async () => {
    calls.push("old");
    if (first) {
      first = false;
      await new Promise<void>((_, r) => { reject = r; });
    }
  });
  q.enqueue(async () => { calls.push("new"); });
  reject(new Error("offline"));
  await tick();
  assert.equal(q.pending, true);
  q.retry();
  q.enqueue(async () => { calls.push("newest"); });
  await tick();
  assert.deepEqual(calls, ["old", "old", "new", "newest"]);
  assert.equal(q.pending, false);
});

it("keeps every later change blocked after another retry failure", async () => {
  let attempts = 0;
  let errors = 0;
  let later = false;
  const q = createWriteQueue(() => { errors++; });
  q.enqueue(async () => { attempts++; throw new Error("offline"); });
  await tick();
  q.enqueue(async () => { later = true; });
  q.retry();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(errors, 2);
  assert.equal(later, false);
  assert.equal(q.pending, true);
});

it("stops queued writes and late errors when the account changes", async () => {
  let reject!: (e: Error) => void;
  let errors = 0;
  let later = false;
  const q = createWriteQueue(() => { errors++; });
  q.enqueue(() => new Promise<void>((_, r) => { reject = r; }));
  q.enqueue(async () => { later = true; });
  q.stop();
  reject(new Error("old account"));
  await tick();
  q.retry();
  assert.equal(errors, 0);
  assert.equal(later, false);
  assert.equal(q.pending, false);
});
