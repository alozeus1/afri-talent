import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  runOrchestratorViaGraph,
  workflowForRunType,
  type OrchestratorCore,
} from "../graphs/orchestratorWrap.graph.js";
import {
  registerGraphEventSink,
  _resetGraphEventSinks,
  type GraphEvent,
} from "../observability/graphEvents.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import type { OrchestratorInput, OrchestratorOutput } from "../../orchestrator/types.js";

// Minimal valid-enough output for the wrap contract (the wrap is agnostic to the
// payload; it only returns it and reads status/budget/refs).
function fakeOutput(runId: string, status: OrchestratorOutput["status"] = "ok"): OrchestratorOutput {
  return {
    run_id: runId,
    status,
    budget: { token_budget_total: 60000, token_used_estimate: 1234, stopped_reason: "" },
    resume_json: { name: "X" },
    ranked_jobs: [],
    tailored_outputs: [],
    notes_for_ui: [],
  } as unknown as OrchestratorOutput;
}

function inputFor(runType: OrchestratorInput["run_type"], runId: string): OrchestratorInput {
  return { run_type: runType, user_id: "u1", resume_text: "resume", run_id: runId } as OrchestratorInput;
}

beforeEach(() => {
  _resetGraphEventSinks();
  _resetCheckpointer();
});

describe("orchestrator wrap graph", () => {
  it("maps run types to workflows", () => {
    expect(workflowForRunType("resume_review")).toBe("resume_review");
    expect(workflowForRunType("job_match")).toBe("job_match");
    expect(workflowForRunType("apply_pack")).toBe("apply_pack");
  });

  it("returns the core output unchanged (parity) and emits start+complete", async () => {
    const events: GraphEvent[] = [];
    registerGraphEventSink((e) => {
      events.push(e);
    });
    const runId = randomUUID();
    const core: OrchestratorCore = async () => fakeOutput(runId);
    const out = await runOrchestratorViaGraph(inputFor("apply_pack", runId), core);

    expect(out.run_id).toBe(runId);
    expect(out).toEqual(fakeOutput(runId)); // identical payload
    const types = events.map((e) => e.type);
    expect(types).toContain("graph_started");
    expect(types).toContain("graph_completed");
  });

  it("propagates core errors (parity with legacy throw)", async () => {
    const runId = randomUUID();
    const core: OrchestratorCore = async () => {
      throw new Error("core boom");
    };
    await expect(runOrchestratorViaGraph(inputFor("job_match", runId), core)).rejects.toThrow(
      "core boom",
    );
  });

  it("maps partial status to PARTIAL in the completion event", async () => {
    const events: GraphEvent[] = [];
    registerGraphEventSink((e) => {
      events.push(e);
    });
    const runId = randomUUID();
    const core: OrchestratorCore = async () => fakeOutput(runId, "partial");
    await runOrchestratorViaGraph(inputFor("job_match", runId), core);
    const completed = events.find((e) => e.type === "graph_completed");
    expect(completed?.details?.status).toBe("PARTIAL");
  });

  it("runs the core exactly once on success", async () => {
    const runId = randomUUID();
    let calls = 0;
    const core: OrchestratorCore = async () => {
      calls += 1;
      return fakeOutput(runId);
    };
    await runOrchestratorViaGraph(inputFor("resume_review", runId), core);
    expect(calls).toBe(1);
  });
});
