/** Ordered, retryable writes. A failed head stays ahead of every later change. */
export function createWriteQueue(onError: (error: unknown) => void) {
  const ops: (() => Promise<void>)[] = [];
  let running = false;
  let blocked = false;
  let stopped = false;

  async function drain() {
    if (running || blocked || stopped) return;
    running = true;
    try {
      while (ops.length && !stopped) {
        try {
          await ops[0]();
          ops.shift();
        } catch (error) {
          if (!stopped) {
            blocked = true;
            onError(error);
          }
          return;
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    get pending() { return ops.length > 0; },
    enqueue(op: () => Promise<void>) {
      if (stopped) return;
      ops.push(op);
      void drain();
    },
    retry() {
      blocked = false;
      void drain();
    },
    stop() {
      stopped = true;
      ops.length = 0;
    },
  };
}
