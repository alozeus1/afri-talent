// ─────────────────────────────────────────────────────────────────────────────
// Per-source circuit breaker + min-interval gate.
//
// closed → (N consecutive failed runs) → open → (cooldown elapsed) → half_open
// half_open → success → closed | failure → open (cooldown restarts)
//
// State is process-local (the scheduler runs the cron in-process). On a fresh
// boot every source starts closed, which is the safe default: one failed run
// costs one bounded, time-boxed attempt.
// ─────────────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

interface SourceState {
  consecutiveFailures: number;
  openedAt: number | null;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class CircuitBreakerRegistry {
  private readonly states = new Map<string, SourceState>();
  readonly failureThreshold: number;
  readonly cooldownMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 6 * 60 * 60 * 1000;
  }

  private state(source: string): SourceState {
    let entry = this.states.get(source);
    if (!entry) {
      entry = { consecutiveFailures: 0, openedAt: null, lastSuccessAt: null, lastAttemptAt: null };
      this.states.set(source, entry);
    }
    return entry;
  }

  stateOf(source: string, now = Date.now()): CircuitState {
    const entry = this.state(source);
    if (entry.openedAt === null) return "closed";
    return now - entry.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  /** False while the circuit is open (cooldown not yet elapsed). */
  canAttempt(source: string, now = Date.now()): boolean {
    return this.stateOf(source, now) !== "open";
  }

  /** False when the source was attempted successfully less than `minIntervalMinutes` ago. */
  intervalElapsed(source: string, minIntervalMinutes: number, now = Date.now()): boolean {
    const last = this.state(source).lastSuccessAt;
    if (last === null || minIntervalMinutes <= 0) return true;
    return now - last >= minIntervalMinutes * 60_000;
  }

  recordSuccess(source: string, now = Date.now()): void {
    const entry = this.state(source);
    entry.consecutiveFailures = 0;
    entry.openedAt = null;
    entry.lastSuccessAt = now;
    entry.lastAttemptAt = now;
  }

  recordFailure(source: string, now = Date.now()): void {
    const entry = this.state(source);
    entry.lastAttemptAt = now;
    entry.consecutiveFailures += 1;
    const wasHalfOpen = this.stateOf(source, now) === "half_open";
    if (wasHalfOpen || entry.consecutiveFailures >= this.failureThreshold) {
      entry.openedAt = now;
    }
  }

  snapshot(now = Date.now()): Array<{ source: string; state: CircuitState; consecutiveFailures: number; lastSuccessAt: string | null }> {
    return Array.from(this.states.entries()).map(([source, entry]) => ({
      source,
      state: this.stateOf(source, now),
      consecutiveFailures: entry.consecutiveFailures,
      lastSuccessAt: entry.lastSuccessAt ? new Date(entry.lastSuccessAt).toISOString() : null,
    }));
  }
}

let sharedRegistry: CircuitBreakerRegistry | null = null;

export function getSharedCircuitBreakers(): CircuitBreakerRegistry {
  if (!sharedRegistry) sharedRegistry = new CircuitBreakerRegistry();
  return sharedRegistry;
}

/** Run `worker` over `items` with at most `limit` in flight; preserves order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
