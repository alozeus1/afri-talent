import logger from "../lib/logger.js";
import { runCandidateRetentionCycle } from "../lib/candidate-retention.js";

export async function runCandidateRetentionWorker(): Promise<void> {
  const sent = await runCandidateRetentionCycle();
  logger.info({ sent }, "[candidate-retention] cycle complete");
}
