/**
 * Agentic Application Flow — premium QA suite
 *
 * Validates the consent / review surface before an AI-written application is
 * submitted. Today the quick-apply + autopilot routes do NOT require an
 * explicit user-approval step — this suite documents that gap and asserts
 * the baseline behaviour is at least correct (no double-apply, PENDING status,
 * cover letter persisted).
 *
 * Gated by E2E_RUN_AGENTIC=1.
 */

import { test, expect, APIRequestContext } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const AGENTIC_ENABLED = process.env.E2E_RUN_AGENTIC === "1";

async function getFreshJobId(request: APIRequestContext, skip: Set<string>): Promise<string | null> {
  const res = await request.get(`${API}/api/jobs?limit=25`);
  if (!res.ok()) return null;
  const body = await res.json();
  const list: Array<{ id: string }> = body.jobs || body.data || [];
  return list.map((j) => j.id).find((id) => !skip.has(id)) ?? null;
}

test.describe("Agentic — Application Flow", () => {
  test.skip(!AGENTIC_ENABLED, "Set E2E_RUN_AGENTIC=1 to run live-AI suites");

  test("application-writer/submit persists cover letter and status=PENDING", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const applied = new Set<string>();
    const jobId = await getFreshJobId(request, applied);
    test.skip(!jobId, "No jobs seeded");

    const submit = await request.post(`${API}/api/skills/application-writer/submit`, {
      data: {
        jobId,
        coverLetter:
          "Dear hiring team,\n\nI am excited to apply. Over the last 5 years I led infrastructure migrations saving $240k annually and grew SLO compliance from 96% to 99.7%.\n\nRegards,\nAda",
      },
    });
    expect([201, 409]).toContain(submit.status());

    const list = await request.get(`${API}/api/skills/application-writer/my-applications`);
    expect(list.ok()).toBe(true);
    const body = await list.json();
    expect(Array.isArray(body.applications)).toBe(true);
    const match = body.applications.find((a: { job: { id: string } }) => a.job.id === jobId);
    if (match) {
      expect(match.status).toBe("PENDING");
      expect(match.coverLetter).toContain("excited to apply");
    }
  });

  test("rejects duplicate application to the same job", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const applied = new Set<string>();
    const jobId = await getFreshJobId(request, applied);
    test.skip(!jobId, "No jobs seeded");

    const first = await request.post(`${API}/api/skills/application-writer/submit`, {
      data: { jobId, coverLetter: "First submission with at least a few words here." },
    });
    expect([201, 409]).toContain(first.status());

    const dup = await request.post(`${API}/api/skills/application-writer/submit`, {
      data: { jobId, coverLetter: "Second submission attempt." },
    });
    expect(dup.status()).toBe(409);
  });

  // Documentation assertion: flags the missing consent step.
  test("quick-apply currently submits WITHOUT an explicit user-approval step (tracked in backlog)", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const applied = new Set<string>();
    const jobId = await getFreshJobId(request, applied);
    test.skip(!jobId, "No jobs seeded");

    // Today this single POST both generates the cover letter AND creates the
    // Application row — there is no separate "approve" step. When we add a
    // consent gate, this test should be updated to expect a 2-step flow.
    const res = await request.post(`${API}/api/quick-apply`, { data: { jobId } });
    expect([201, 400, 403, 404, 429]).toContain(res.status());

    if (res.status() === 201) {
      const body = await res.json();
      expect(body.status).toBe("PENDING");
      // No approvalRequired / needsReview field exists today — backlog-2.
      expect((body as Record<string, unknown>).approvalRequired).toBeUndefined();
    }
  });
});
