import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("../../../../prisma.js", () => ({
  default: { graphRun: { findUnique } },
}));

import {
  isGraphRunDenied,
  assertGraphRunNotDenied,
  GraphRunDeniedError,
} from "../prismaTools.js";

describe("graph run deny guard", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("isGraphRunDenied returns true only for a DENIED run", async () => {
    findUnique.mockResolvedValueOnce({ approvalState: "DENIED" });
    expect(await isGraphRunDenied("run-1")).toBe(true);

    findUnique.mockResolvedValueOnce({ approvalState: "REQUESTED" });
    expect(await isGraphRunDenied("run-1")).toBe(false);

    findUnique.mockResolvedValueOnce(null);
    expect(await isGraphRunDenied("missing")).toBe(false);
  });

  it("fails open (not denied) when the read throws", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await isGraphRunDenied("run-1")).toBe(false);
  });

  it("assertGraphRunNotDenied throws GraphRunDeniedError for a denied run", async () => {
    findUnique.mockResolvedValueOnce({ approvalState: "DENIED" });
    await expect(assertGraphRunNotDenied("run-1")).rejects.toBeInstanceOf(GraphRunDeniedError);
  });

  it("assertGraphRunNotDenied resolves for a non-denied run", async () => {
    findUnique.mockResolvedValueOnce({ approvalState: "GRANTED" });
    await expect(assertGraphRunNotDenied("run-1")).resolves.toBeUndefined();
  });
});
