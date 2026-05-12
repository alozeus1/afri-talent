// §5.8 — AutoApplyBatch completion rollup unit tests.

import { describe, expect, it } from "vitest";
import { recomputeAutoApplyBatchStatus } from "../lib/apply/batch-rollup.js";

function buildPrisma(batch: { jobsTargeted: number; jobsApplied: number; jobsFailed: number; completedAt: Date | null }) {
  let stored = { ...batch };
  const updates: Array<Record<string, unknown>> = [];
  return {
    autoApplyBatch: {
      findUnique: async () => stored,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        stored = { ...stored, ...data } as typeof stored;
        return stored;
      },
    },
    _updates: () => updates,
  };
}

describe("§5.8 — recomputeAutoApplyBatchStatus", () => {
  it("returns non-terminal when pending > 0 and does not stamp completedAt", async () => {
    const prisma = buildPrisma({ jobsTargeted: 5, jobsApplied: 2, jobsFailed: 1, completedAt: null });
    const r = await recomputeAutoApplyBatchStatus(prisma as never, "b1");
    expect(r.isTerminal).toBe(false);
    expect(r.pending).toBe(2);
    expect(prisma._updates()).toHaveLength(0);
  });

  it("stamps completedAt + status when applied + failed == jobsTargeted", async () => {
    const prisma = buildPrisma({ jobsTargeted: 3, jobsApplied: 2, jobsFailed: 1, completedAt: null });
    const r = await recomputeAutoApplyBatchStatus(prisma as never, "b2");
    expect(r.isTerminal).toBe(true);
    const updates = prisma._updates();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "completed" });
    expect(updates[0].completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent — does not re-stamp when completedAt already set", async () => {
    const prisma = buildPrisma({ jobsTargeted: 3, jobsApplied: 3, jobsFailed: 0, completedAt: new Date("2026-05-13") });
    const r = await recomputeAutoApplyBatchStatus(prisma as never, "b3");
    expect(r.isTerminal).toBe(true);
    expect(prisma._updates()).toHaveLength(0);
  });

  it("treats jobsTargeted=0 as non-terminal (empty batch)", async () => {
    const prisma = buildPrisma({ jobsTargeted: 0, jobsApplied: 0, jobsFailed: 0, completedAt: null });
    const r = await recomputeAutoApplyBatchStatus(prisma as never, "b4");
    expect(r.isTerminal).toBe(false);
  });

  it("returns zeros when batch missing", async () => {
    const prisma = {
      autoApplyBatch: {
        findUnique: async () => null,
        update: async () => ({}),
      },
    };
    const r = await recomputeAutoApplyBatchStatus(prisma as never, "missing");
    expect(r).toEqual({ isTerminal: false, applied: 0, failed: 0, pending: 0 });
  });
});
