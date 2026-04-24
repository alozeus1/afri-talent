import logger from "../lib/logger.js";
import { runBillingReconciliationCycle } from "../lib/billing/index.js";
export async function runBillingReconciliationWorker() {
    const result = await runBillingReconciliationCycle("scheduler");
    logger.info({ result }, "[billing-reconciliation] cycle complete");
}
//# sourceMappingURL=billing-reconciliation.js.map