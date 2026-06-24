import { describe, it, expect } from "vitest";
import {
  BaseGraphStateSchema,
  initBaseState,
  WorkflowTypeSchema,
} from "../state/schemas.js";
import {
  appendReducer,
  lastWriteWins,
  mergeTokenUsage,
} from "../state/reducers.js";

describe("BaseGraphState schema", () => {
  it("initializes a valid base state with defaults", () => {
    const s = initBaseState({ graphRunId: "run-1", workflowType: "apply_pack", userId: "u1" });
    expect(s.graphRunId).toBe("run-1");
    expect(s.workflowType).toBe("apply_pack");
    expect(s.status).toBe("RUNNING");
    expect(s.approvalState).toBe("NONE");
    expect(s.inputRefs).toEqual([]);
    expect(s.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(s.createdAt).toEqual(s.updatedAt);
  });

  it("rejects an invalid workflow type", () => {
    const r = BaseGraphStateSchema.safeParse({
      graphRunId: "x",
      workflowType: "not_a_workflow",
      createdAt: "t",
      updatedAt: "t",
    });
    expect(r.success).toBe(false);
  });

  it("enumerates exactly the 12 workflow types", () => {
    expect(WorkflowTypeSchema.options).toHaveLength(12);
  });
});

describe("reducers", () => {
  it("appendReducer accumulates arrays and single items, ignores undefined", () => {
    expect(appendReducer([1], [2, 3])).toEqual([1, 2, 3]);
    expect(appendReducer([1], 2)).toEqual([1, 2]);
    expect(appendReducer([1], undefined)).toEqual([1]);
  });

  it("lastWriteWins prefers defined b", () => {
    expect(lastWriteWins("a", "b")).toBe("b");
    expect(lastWriteWins("a", undefined)).toBe("a");
  });

  it("mergeTokenUsage sums additively and derives total when absent", () => {
    const merged = mergeTokenUsage(
      { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      { inputTokens: 4, outputTokens: 1 },
    );
    expect(merged).toEqual({ inputTokens: 14, outputTokens: 6, totalTokens: 20 });
  });
});
