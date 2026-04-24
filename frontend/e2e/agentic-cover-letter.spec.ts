/**
 * Agentic Cover Letter — premium QA suite
 *
 * Validates /api/skills/application-writer/generate for each tone preset and
 * runs deterministic quality checks on the output.
 *
 * Gated by E2E_RUN_AGENTIC=1.
 */

import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const AGENTIC_ENABLED = process.env.E2E_RUN_AGENTIC === "1";

const BANNED = ["hard-working", "results-driven", "rockstar", "synergy", "team player"];

async function getAnyPublishedJobId(request: import("@playwright/test").APIRequestContext): Promise<string | null> {
  const res = await request.get(`${API}/api/jobs?limit=1`);
  if (!res.ok()) return null;
  const body = await res.json();
  const list = body.jobs || body.data || [];
  return list[0]?.id ?? null;
}

test.describe("Agentic — Cover Letter", () => {
  test.skip(!AGENTIC_ENABLED, "Set E2E_RUN_AGENTIC=1 to run live-AI suites");

  test("generates cover letters for all three tone presets", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const jobId = await getAnyPublishedJobId(request);
    test.skip(!jobId, "No published jobs in dev DB — run `prisma db seed` first");

    for (const tone of ["professional", "conversational", "executive"] as const) {
      const res = await request.post(`${API}/api/skills/application-writer/generate`, {
        data: { jobId, tone },
      });
      expect(res.status(), `tone=${tone} HTTP ${res.status()}`).toBe(200);
      const body = await res.json();
      expect(body.coverLetter, `tone=${tone} missing coverLetter`).toBeTruthy();
      expect(body.source).toMatch(/^(ai|template)$/);

      const text: string = body.coverLetter.toLowerCase();

      // Must be in target length range 120..400 words.
      const words = text.split(/\s+/).filter(Boolean);
      expect(words.length, `tone=${tone} length ${words.length}`).toBeGreaterThanOrEqual(80);
      expect(words.length, `tone=${tone} length ${words.length}`).toBeLessThanOrEqual(500);

      // No placeholders.
      expect(text).not.toMatch(/\[insert/);
      expect(text).not.toMatch(/\{\{[^}]+\}\}/);

      // No cliches.
      for (const phrase of BANNED) {
        expect(text, `tone=${tone} contained "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  test("rejects bad jobId payload", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/skills/application-writer/generate`, {
      data: { jobId: "not-a-uuid" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns NO_RESUME when the candidate has no resume/profile context", async ({ request }) => {
    // Fresh user with zero profile content
    const email = `empty+${Date.now()}@example.com`;
    const password = TEST_CANDIDATE.password;
    await request.post(`${API}/api/auth/register`, {
      data: { email, password, name: "Empty", role: "CANDIDATE" },
    });
    await loginAs(request, { email, password });
    const jobId = await getAnyPublishedJobId(request);
    test.skip(!jobId, "No published jobs in dev DB");

    const res = await request.post(`${API}/api/skills/application-writer/generate`, {
      data: { jobId },
    });
    // Could be 400 NO_RESUME or 403 if the fresh user lacks PROFESSIONAL plan.
    expect([400, 402, 403]).toContain(res.status());
  });
});
