import { describe, expect, it } from "vitest";
import type { AggregationDiagnostics, JobSource, SourceFetchDiagnostics } from "../lib/jobs/aggregator/types.js";
import { evaluateIngestionCycle } from "./aggregator-cron.js";

function buildSourceDiagnostics(
  source: JobSource,
  status: SourceFetchDiagnostics["status"],
  jobsFetched: number,
  errorCount = 0,
): SourceFetchDiagnostics {
  return {
    source,
    status,
    jobsFetched,
    errorCount,
    durationMs: 120,
    failureReason: status === "failure" ? "network" : undefined,
    errors: errorCount > 0 ? Array.from({ length: errorCount }, () => "network error") : undefined,
  };
}

function buildDiagnostics(sourceDiagnostics: SourceFetchDiagnostics[], hadErrors: boolean): AggregationDiagnostics {
  const sourcesFailed = sourceDiagnostics.filter((entry) => entry.status === "failure").length;
  return {
    sourcesAttempted: sourceDiagnostics.length,
    sourcesSucceeded: sourceDiagnostics.length - sourcesFailed,
    sourcesFailed,
    jobsFetched: sourceDiagnostics.reduce((sum, entry) => sum + entry.jobsFetched, 0),
    duplicatesRemoved: 0,
    hadErrors,
    sourceDiagnostics,
  };
}

describe("evaluateIngestionCycle", () => {
  it("marks the cycle as failure when all critical sources fail", () => {
    const diagnostics = buildDiagnostics(
      [
        buildSourceDiagnostics("GREENHOUSE", "failure", 0, 1),
        buildSourceDiagnostics("LEVER", "failure", 0, 1),
      ],
      true,
    );

    const evaluation = evaluateIngestionCycle({
      jobsIngested: 0,
      diagnostics,
      criticalSources: ["GREENHOUSE", "LEVER"],
    });

    expect(evaluation.cycleStatus).toBe("failure");
    expect(evaluation.allCriticalSourcesFailed).toBe(true);
    expect(evaluation.successCheckpointEligible).toBe(false);
    expect(evaluation.reasons).toContain("all_critical_sources_failed");
  });

  it("marks partial source success with data as successful and checkpoint-eligible", () => {
    const diagnostics = buildDiagnostics(
      [
        buildSourceDiagnostics("GREENHOUSE", "success", 12, 0),
        buildSourceDiagnostics("LEVER", "failure", 0, 1),
      ],
      true,
    );

    const evaluation = evaluateIngestionCycle({
      jobsIngested: 10,
      diagnostics,
      criticalSources: ["GREENHOUSE", "LEVER"],
    });

    expect(evaluation.cycleStatus).toBe("success");
    expect(evaluation.sourcesSucceeded).toBe(1);
    expect(evaluation.successCheckpointEligible).toBe(true);
    expect(evaluation.reasons).toHaveLength(0);
  });

  it("marks zero-result cycles with errors as failure", () => {
    const diagnostics = buildDiagnostics(
      [
        buildSourceDiagnostics("GREENHOUSE", "success", 0, 1),
        buildSourceDiagnostics("LEVER", "success", 0, 0),
      ],
      true,
    );

    const evaluation = evaluateIngestionCycle({
      jobsIngested: 0,
      diagnostics,
      criticalSources: ["GREENHOUSE", "LEVER"],
    });

    expect(evaluation.cycleStatus).toBe("failure");
    expect(evaluation.zeroResultWithErrors).toBe(true);
    expect(evaluation.successCheckpointEligible).toBe(false);
    expect(evaluation.reasons).toContain("zero_result_with_errors");
  });

  it("treats a true zero-result cycle with no errors as success but not checkpoint-eligible", () => {
    const diagnostics = buildDiagnostics(
      [
        buildSourceDiagnostics("GREENHOUSE", "success", 0, 0),
        buildSourceDiagnostics("LEVER", "success", 0, 0),
      ],
      false,
    );

    const evaluation = evaluateIngestionCycle({
      jobsIngested: 0,
      diagnostics,
      criticalSources: ["GREENHOUSE", "LEVER"],
    });

    expect(evaluation.cycleStatus).toBe("success");
    expect(evaluation.zeroResultWithErrors).toBe(false);
    expect(evaluation.successCheckpointEligible).toBe(false);
  });
});
