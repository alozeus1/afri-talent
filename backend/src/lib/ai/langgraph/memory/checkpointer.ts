// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — checkpointer factory
//
// Production uses a PostgreSQL-backed checkpointer (durable, resumable graph
// state) against the existing DATABASE_URL. Tests / MOCK_AI use an in-memory
// saver so they are hermetic and need no database.
//
// The Postgres saver manages its own tables (checkpoints, checkpoint_writes,
// checkpoint_blobs). Call setupCheckpointer() once during app bootstrap (NOT at
// import time, and NOT in a flag-off deployment) to create them idempotently.
// ─────────────────────────────────────────────────────────────────────────────

import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import logger from "../../../logger.js";
import { isMockAi } from "../policies/modelPolicy.js";

let singleton: BaseCheckpointSaver | undefined;
let isSetup = false;

function useMemorySaver(): boolean {
  return isMockAi() || process.env.NODE_ENV === "test" || !process.env.DATABASE_URL;
}

/** Get the process-wide checkpointer singleton. */
export function getCheckpointer(): BaseCheckpointSaver {
  if (singleton) return singleton;
  if (useMemorySaver()) {
    logger.info({ saver: "memory" }, "[graph] using in-memory checkpointer");
    singleton = new MemorySaver();
  } else {
    logger.info({ saver: "postgres" }, "[graph] using Postgres checkpointer");
    singleton = PostgresSaver.fromConnString(process.env.DATABASE_URL as string);
  }
  return singleton;
}

/**
 * Idempotently create checkpointer tables. No-op for the memory saver. Safe to
 * call multiple times. Run during bootstrap when LANGGRAPH_ENABLED is on.
 */
export async function setupCheckpointer(): Promise<void> {
  if (isSetup) return;
  const cp = getCheckpointer();
  if (cp instanceof PostgresSaver) {
    await cp.setup();
    logger.info("[graph] Postgres checkpointer tables ready");
  }
  isSetup = true;
}

/** For tests: reset the singleton so a fresh MemorySaver is created. */
export function _resetCheckpointer(): void {
  singleton = undefined;
  isSetup = false;
}
