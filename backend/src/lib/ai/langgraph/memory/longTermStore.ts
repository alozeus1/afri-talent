// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — long-term (cross-thread) store
//
// Optional key/value memory shared across graph runs (e.g. a candidate's
// preferences reused across apply-pack runs). Phase 1 provides an in-memory
// store; a Postgres-backed store can be substituted later without changing call
// sites. Never store raw PII here — store references/derived signals only.
// ─────────────────────────────────────────────────────────────────────────────

import { InMemoryStore, type BaseStore } from "@langchain/langgraph";

let singleton: BaseStore | undefined;

/** Get the process-wide long-term store singleton. */
export function getLongTermStore(): BaseStore {
  if (!singleton) singleton = new InMemoryStore();
  return singleton;
}

export function _resetLongTermStore(): void {
  singleton = undefined;
}
