import { describe, it, expect, beforeEach } from "vitest";
import {
  emitGraphEvent,
  registerGraphEventSink,
  _resetGraphEventSinks,
  type GraphEvent,
} from "../observability/graphEvents.js";
import { tracedNode } from "../observability/graphTracing.js";

beforeEach(() => _resetGraphEventSinks());

describe("emitGraphEvent", () => {
  it("stamps `at` and fans out to sinks", async () => {
    const seen: GraphEvent[] = [];
    registerGraphEventSink((e) => {
      seen.push(e);
    });
    const ev = emitGraphEvent({
      graphRunId: "r1",
      workflowType: "apply_pack",
      type: "graph_started",
    });
    expect(ev.at).toBeTruthy();
    // sinks are invoked synchronously here
    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe("graph_started");
  });

  it("never throws when a sink throws", () => {
    registerGraphEventSink(() => {
      throw new Error("sink boom");
    });
    expect(() =>
      emitGraphEvent({ graphRunId: "r2", workflowType: "job_match", type: "node_completed" }),
    ).not.toThrow();
  });
});

describe("tracedNode", () => {
  it("emits started + completed and returns the result", async () => {
    const seen: GraphEvent[] = [];
    registerGraphEventSink((e) => {
      seen.push(e);
    });
    const result = await tracedNode(
      { graphRunId: "r3", workflowType: "resume_review" },
      "parse",
      async () => 42,
    );
    expect(result).toBe(42);
    const types = seen.map((e) => e.type);
    expect(types).toContain("node_started");
    expect(types).toContain("node_completed");
  });

  it("emits node_failed and rethrows on error", async () => {
    const seen: GraphEvent[] = [];
    registerGraphEventSink((e) => {
      seen.push(e);
    });
    await expect(
      tracedNode({ graphRunId: "r4", workflowType: "resume_review" }, "boom", async () => {
        throw new Error("node boom");
      }),
    ).rejects.toThrow("node boom");
    expect(seen.map((e) => e.type)).toContain("node_failed");
  });
});
