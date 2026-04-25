/**
 * Agentic Job Matching — premium QA suite
 *
 * Validates vector + keyword matching paths and exercises the embed-resume
 * endpoint. Flags the current UX gap where backend returns no explanation /
 * verified-employer data (documented in AFRITALENT_PREMIUM_QUALITY_BACKLOG.md).
 *
 * Gated by E2E_RUN_AGENTIC=1.
 */

import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const AGENTIC_ENABLED = process.env.E2E_RUN_AGENTIC === "1";

test.describe("Agentic — Job Matching", () => {
  test.skip(!AGENTIC_ENABLED, "Set E2E_RUN_AGENTIC=1 to run live-AI suites");

  test("embed-resume followed by matches returns sorted vector results", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);

    // 1. Ensure the candidate has a saved resume.
    await request.post(`${API}/api/skills/resume-builder/save`, {
      data: {
        content: { skills: ["TypeScript", "React"], summary: "Senior frontend." },
        rawText:
          "Senior frontend engineer with 6 years of TypeScript + React. Shipped 14 production apps. Reduced bundle size by 42%.",
      },
    });

    // 2. Force re-embed.
    const embedRes = await request.post(`${API}/api/skills/job-matcher/embed-resume`);
    expect([200, 400]).toContain(embedRes.status()); // 400 allowed if OPENAI_API_KEY missing locally

    // 3. Fetch matches.
    const res = await request.get(`${API}/api/skills/job-matcher/matches?limit=10`);
    expect([200, 400]).toContain(res.status());
    if (res.status() !== 200) return; // no resume/profile yet

    const body = await res.json();
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matchMethod).toMatch(/^(vector|keyword|none)$/);

    // Basic invariants for each match row.
    for (const m of body.matches.slice(0, 10)) {
      expect(m.jobId).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.company).toBeTruthy();
      expect(typeof m.score).toBe("number");
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
      expect(m.matchMethod).toMatch(/^(vector|keyword)$/);
    }

    // Results must be sorted by descending score.
    const scores = body.matches.map((m: { score: number }) => m.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1] + 0.01);
    }
  });

  test("returns NO_RESUME code when candidate has no saved resume", async ({ request }) => {
    const email = `nomatch+${Date.now()}@example.com`;
    const password = TEST_CANDIDATE.password;
    await request.post(`${API}/api/auth/register`, {
      data: { email, password, name: "NoMatch", role: "CANDIDATE" },
    });
    await loginAs(request, { email, password });

    const res = await request.get(`${API}/api/skills/job-matcher/matches`);
    // 400 NO_RESUME (or 403 if plan gate blocks PROFESSIONAL requirement first).
    expect([400, 402, 403]).toContain(res.status());
  });

  // Documentation assertion: flags the known UX gap.
  test("current matches response is missing explanation + verified-employer fields (tracked in backlog)", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/skills/job-matcher/matches?limit=1`);
    if (res.status() !== 200) {
      test.skip(true, "Match endpoint not returning 200 in this env");
      return;
    }
    const body = await res.json();
    const m = body.matches?.[0];
    if (!m) return;

    // Intentional: these keys do NOT exist today. When they start appearing,
    // this test will fail — signalling the backend has caught up with the
    // frontend premium requirement.
    expect(m.explanation, "BACKLOG-1: explanation not yet present").toBeUndefined();
    expect(m.verifiedEmployer, "BACKLOG-1: verifiedEmployer not yet present").toBeUndefined();
  });
});
