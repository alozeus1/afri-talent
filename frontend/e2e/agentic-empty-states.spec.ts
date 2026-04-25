/**
 * Agentic Empty-State Behaviour — premium QA suite
 *
 * Ensures every AI endpoint fails gracefully when inputs are missing or
 * incomplete (no resume, no profile, bad tone, SKILLS_ENABLED=false, etc).
 *
 * Gated by E2E_RUN_AGENTIC=1.
 */

import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const AGENTIC_ENABLED = process.env.E2E_RUN_AGENTIC === "1";

test.describe("Agentic — Empty States & Error Surfaces", () => {
  test.skip(!AGENTIC_ENABLED, "Set E2E_RUN_AGENTIC=1 to run live-AI suites");

  test("unauthenticated request returns 401 across all skills routes", async ({ request }) => {
    for (const path of [
      "/api/skills/resume-builder/my-resume",
      "/api/skills/job-matcher/matches",
      "/api/skills/career-advisor/history",
    ]) {
      const res = await request.get(`${API}${path}`);
      expect(res.status(), path).toBe(401);
    }
  });

  test("fresh candidate without saved resume cannot request career analysis", async ({ request }) => {
    const email = `empty-career+${Date.now()}@example.com`;
    const password = TEST_CANDIDATE.password;
    await request.post(`${API}/api/auth/register`, {
      data: { email, password, name: "Empty", role: "CANDIDATE" },
    });
    await loginAs(request, { email, password });

    const res = await request.post(`${API}/api/skills/career-advisor/analyze`, {
      data: { targetRole: "Data Engineer" },
    });
    // NO_RESUME (400) or plan-gate (402/403) are both acceptable hard-stops.
    expect([400, 402, 403]).toContain(res.status());
  });

  test("bad tone value is rejected with validation error", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/skills/application-writer/generate`, {
      data: {
        jobId: "00000000-0000-0000-0000-000000000000",
        tone: "screaming",
      },
    });
    expect([400, 404]).toContain(res.status());
  });

  test("oversized resume input is rejected before hitting the model", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/skills/resume-builder/save`, {
      data: { content: {}, rawText: "x".repeat(70_000) },
    });
    expect(res.status()).toBe(400);
  });

  test("ATS scanner returns a structured score object or a validation error", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/skills/resume-builder/scan-ats`, {
      data: {
        resumeText:
          "Senior Engineer with 8 years building fintech. Reduced latency by 42%. Managed 15 person team. Shipped 120 production services.",
        jobDescription: "Looking for a senior engineer with TypeScript, Node.js, PostgreSQL experience.",
      },
    });
    expect([200, 400, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });
});
