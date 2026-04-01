import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import app from "../app.js";

describe("Phase 4 feature flag gates", () => {
  beforeEach(() => {
    process.env.PHASE4_SOCIAL_ENABLED = "0";
    process.env.PHASE4_SALARY_NEGOTIATION_ENABLED = "0";
    process.env.PHASE4_UNIVERSITY_API_ENABLED = "0";
    process.env.PHASE4_EMPLOYER_AI_ENABLED = "0";
    process.env.PHASE4_BOTS_ENABLED = "0";
  });

  it("returns FEATURE_DISABLED for social routes when flag is off", async () => {
    const res = await request(app).get("/api/social/profile");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FEATURE_DISABLED");
  });

  it("returns FEATURE_DISABLED for salary negotiation routes when flag is off", async () => {
    const res = await request(app).get("/api/salary-negotiation/sessions");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FEATURE_DISABLED");
  });

  it("returns FEATURE_DISABLED for university partner routes when flag is off", async () => {
    const res = await request(app).get("/api/university-partners/ingest");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FEATURE_DISABLED");
  });

  it("returns FEATURE_DISABLED for employer AI routes when flag is off", async () => {
    const res = await request(app).get("/api/employer/ai/tasks");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FEATURE_DISABLED");
  });

  it("returns FEATURE_DISABLED for bot routes when flag is off", async () => {
    const res = await request(app).get("/api/bots/subscriptions");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("FEATURE_DISABLED");
  });
});

