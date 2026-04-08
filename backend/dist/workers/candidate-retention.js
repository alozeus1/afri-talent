import logger from "../lib/logger.js";
import { runCandidateRetentionCycle } from "../lib/candidate-retention.js";
export async function runCandidateRetentionWorker() {
    const sent = await runCandidateRetentionCycle();
    logger.info({ sent }, "[candidate-retention] cycle complete");
}
//# sourceMappingURL=candidate-retention.js.map