/**
 * Agentic Resume Builder — premium QA suite
 *
 * Validates the AI resume builder end-to-end and runs deterministic quality
 * checks against the generated output using the same rubric rules the backend
 * ships with.
 *
 * Gated by E2E_RUN_AGENTIC=1 so live-AI suites never run on regular CI.
 *
 * Requires:
 *   - Backend running on API_BASE_URL (http://localhost:4000)
 *   - Candidate seeded with a PROFESSIONAL subscription
 *   - OPENAI_API_KEY + ANTHROPIC_API_KEY set server-side
 *   - MOCK_AI unset (so real models run)
 */

import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const AGENTIC_ENABLED = process.env.E2E_RUN_AGENTIC === "1";

test.describe.configure({ mode: "serial" });

test.describe("Agentic — Resume Builder", () => {
  test.skip(!AGENTIC_ENABLED, "Set E2E_RUN_AGENTIC=1 to run live-AI suites");

  test("generates a structured resume and passes basic quality gates", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);

    const payload = {
      fullName: "Ada Okonkwo",
      email: TEST_CANDIDATE.email,
      phone: "+234 800 111 2233",
      location: "Lagos, Nigeria",
      targetRole: "Senior Product Engineer",
      yearsExperience: 6,
      summary: "Product-minded full-stack engineer focused on fintech reliability.",
      skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Kubernetes"],
      workHistory: [
        {
          company: "PayRail",
          title: "Senior Engineer",
          period: "2022 - Present",
          description:
            "Led checkout rewrite; reduced p95 latency from 900ms to 420ms; grew conversion from 2.1% to 3.8%.",
        },
        {
          company: "Flutterpay",
          title: "Software Engineer",
          period: "2019 - 2022",
          description:
            "Built reconciliation pipeline processing 2M transactions/day; cut ops overhead by 40%.",
        },
      ],
      educationHistory: [
        { institution: "University of Lagos", degree: "B.Sc. Computer Science", period: "2014 - 2018" },
      ],
      certifications: ["AWS Solutions Architect Associate"],
    };

    const res = await request.post(`${API}/api/skills/resume-builder/generate`, { data: payload });
    expect(res.status(), `HTTP ${res.status()} ${await res.text().catch(() => "")}`).toBe(200);

    const body = await res.json();
    expect(body.resume).toBeTruthy();
    expect(body.resume.source).toMatch(/^(ai|template)$/);
    expect(body.resume.rawText.length).toBeGreaterThan(200);
    expect(body.resume.sections.summary).toBeTruthy();
    expect(Array.isArray(body.resume.sections.skills)).toBe(true);
    expect(body.resume.sections.experience.length).toBeGreaterThan(0);

    const raw: string = body.resume.rawText.toLowerCase();

    // No banned cliche phrases should leak into the output.
    for (const phrase of ["hard-working", "results-driven", "rockstar", "synergy", "team player"]) {
      expect(raw, `banned phrase "${phrase}" found`).not.toContain(phrase);
    }

    // No unfilled placeholders.
    expect(raw).not.toMatch(/\[insert/);
    expect(raw).not.toMatch(/\{\{[^}]+\}\}/);
    expect(raw).not.toMatch(/\btbd\b/);

    // At least one expected ATS keyword should survive round-trip.
    const mustHave = ["typescript", "react", "node", "postgres"];
    const present = mustHave.filter((k) => raw.includes(k));
    expect(present.length).toBeGreaterThanOrEqual(2);
  });

  test("save + fetch cycle returns the same resume content", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);

    const saveRes = await request.post(`${API}/api/skills/resume-builder/save`, {
      data: {
        content: { summary: "Saved summary", skills: ["TypeScript"] },
        rawText: "JANE DOE\nProfessional summary…\nSkills: TypeScript",
      },
    });
    expect(saveRes.ok()).toBe(true);

    const fetchRes = await request.get(`${API}/api/skills/resume-builder/my-resume`);
    expect(fetchRes.ok()).toBe(true);
    const body = await fetchRes.json();
    expect(body.resume?.rawText).toContain("TypeScript");
  });

  test("rejects invalid input with 400 and structured zod errors", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/skills/resume-builder/generate`, {
      data: { fullName: "", email: "not-an-email", targetRole: "" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.details)).toBe(true);
  });
});
