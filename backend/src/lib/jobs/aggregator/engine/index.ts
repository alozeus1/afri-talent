export { runIngestion, toAggregationDiagnostics, type RunIngestionOptions } from "./pipeline.js";
export { buildFeedSources } from "./registry.js";
export { getSharedCircuitBreakers } from "./circuit-breaker.js";
export { DEFAULT_ATS_COMPANIES } from "./catalog/companies.js";
export type { IngestionRunReport, SourceRunMetrics, RunTotals, FeedSourceId } from "./types.js";

/** AGGREGATOR_ENGINE=legacy switches the cron/manual sync back to the old JobAggregator. */
export function useLegacyAggregator(): boolean {
  return (process.env.AGGREGATOR_ENGINE || "").toLowerCase() === "legacy";
}
