#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — Golden Test
//
// Runs all three run_types against a realistic sample payload and validates
// the output structure, thresholds, and key invariants.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx backend/scripts/orchestrator_golden_test.ts
//
// Or from the backend directory:
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/orchestrator_golden_test.ts
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { runOrchestrator } from "../src/lib/ai/orchestrator/index.js";
import type { OrchestratorOutput } from "../src/lib/ai/orchestrator/types.js";

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_RESUME = `
Adeola Fashola
adeola.fashola@gmail.com | +234 802 555 1234 | Lagos, Nigeria
github.com/adeolafashola | linkedin.com/in/adeolafashola

PROFESSIONAL SUMMARY
Backend software engineer with 5 years of experience building scalable APIs and
distributed systems. Specialised in Node.js, TypeScript, and PostgreSQL. Delivered
payment integrations handling $2M+ monthly transactions at Paystack. Open to
remote opportunities with European and US companies.

EXPERIENCE

Senior Backend Engineer — Paystack (Lagos, Nigeria)
Jan 2021 – Present
- Architected a webhook delivery system processing 500K events/day with 99.95% uptime
- Led migration of monolith to microservices, reducing P95 latency by 40%
- Mentored 3 junior engineers; introduced code-review culture that cut bug rate by 25%
- Built Stripe and Flutterwave payment integrations using Node.js and TypeScript

Software Engineer — Andela (Remote)
Mar 2019 – Dec 2020
- Developed RESTful APIs for US fintech client using Express.js and PostgreSQL
- Improved test coverage from 45% to 88% using Jest
- Implemented Redis caching that reduced database load by 60%
- Collaborated with distributed team across 4 time zones

EDUCATION
B.Sc. Computer Science — University of Lagos, 2018

SKILLS
Node.js, TypeScript, Express.js, PostgreSQL, Redis, Docker, AWS (EC2, RDS, S3),
REST APIs, GraphQL, Jest, GitHub Actions, Prisma ORM, Stripe, Microservices

LANGUAGES
English (fluent), Yoruba (native)

CERTIFICATIONS
AWS Certified Developer – Associate (2022)
`;

const SAMPLE_JOB_MATCHING = `
Senior Backend Engineer — FinFlow UK
Location: London, UK (remote-friendly for African candidates)
Type: Full-time
Salary: £60,000 – £80,000

About FinFlow:
FinFlow is a Series B fintech startup building payment infrastructure for African
businesses accessing UK and EU markets.

Requirements (MUST HAVE):
- 4+ years of backend engineering experience
- Strong TypeScript / Node.js skills
- Experience with PostgreSQL or similar relational databases
- Experience building and maintaining REST APIs
- Experience with payment integrations (Stripe, Flutterwave, or similar)

Nice to have:
- Redis or other caching experience
- Experience with microservices architecture
- AWS or similar cloud platform experience
- Prior fintech experience

Visa Sponsorship: YES — we sponsor skilled worker visas for African candidates
Relocation: Relocation assistance available
`;

const SAMPLE_JOB_LOW_MATCH = `
Principal Machine Learning Engineer — DataCore Inc
Location: San Francisco, CA (onsite only)
Type: Full-time
Salary: $200,000 – $250,000

MUST HAVE:
- PhD in Computer Science, Statistics, or related field
- 8+ years of ML research experience
- Experience with PyTorch, TensorFlow, CUDA GPU programming
- Publications in top ML conferences (NeurIPS, ICML, ICLR)
- Expert-level Python

Nice to have:
- Experience with LLM fine-tuning at scale
- C++ systems programming

Visa Sponsorship: NO
Relocation assistance: NO
`;

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function header(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function validateOutput(output: OrchestratorOutput, label: string): void {
  assert(typeof output.run_id === "string" && output.run_id.length > 0, `${label}: has run_id`);
  assert(["ok", "partial", "blocked"].includes(output.status), `${label}: status is valid`);
  assert(typeof output.budget.token_used_estimate === "number", `${label}: budget tracked`);
  assert(typeof output.budget.token_budget_total === "number", `${label}: budget total present`);
  assert(Array.isArray(output.ranked_jobs), `${label}: ranked_jobs is array`);
  assert(Array.isArray(output.tailored_outputs), `${label}: tailored_outputs is array`);
  assert(Array.isArray(output.notes_for_ui), `${label}: notes_for_ui is array`);
  assert(output.resume_json !== null && typeof output.resume_json === "object", `${label}: resume_json present`);
}

// ── Test 1: resume_review ─────────────────────────────────────────────────────

async function testResumeReview(): Promise<void> {
  header("Test 1: resume_review");

  const output = await runOrchestrator({
    run_type: "resume_review",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
  });

  console.log(`  run_id: ${output.run_id}`);
  console.log(`  tokens used: ${output.budget.token_used_estimate}`);
  console.log(`  candidate name: ${output.resume_json.name ?? "(not found)"}`);

  validateOutput(output, "resume_review");
  assert(output.ranked_jobs.length === 0, "resume_review: no ranked jobs");
  assert(output.tailored_outputs.length === 0, "resume_review: no tailored outputs");
  assert(Array.isArray(output.resume_json.skills), "resume_review: skills array present");
  assert(Array.isArray(output.resume_json.experience), "resume_review: experience array present");
  assert(output.resume_json.skills.length > 0, "resume_review: parsed at least 1 skill");
  assert(output.resume_json.experience.length > 0, "resume_review: parsed at least 1 experience entry");
}

// ── Test 2: job_match ─────────────────────────────────────────────────────────

async function testJobMatch(): Promise<void> {
  header("Test 2: job_match");

  const output = await runOrchestrator({
    run_type: "job_match",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
    candidate_profile: {
      location: "Lagos, Nigeria",
      target_roles: ["Backend Engineer", "Software Engineer"],
      work_auth: "open_to_relocation",
    },
    jobs: [
      {
        job_id: "job-001-finflow",
        source: "internal",
        raw_text: SAMPLE_JOB_MATCHING,
      },
      {
        job_id: "job-002-ml",
        source: "linkedin",
        raw_text: SAMPLE_JOB_LOW_MATCH,
      },
    ],
  });

  console.log(`  run_id: ${output.run_id}`);
  console.log(`  tokens used: ${output.budget.token_used_estimate}`);
  console.log(`  jobs ranked: ${output.ranked_jobs.length}`);

  validateOutput(output, "job_match");
  assert(output.ranked_jobs.length === 2, "job_match: 2 jobs ranked");
  assert(output.tailored_outputs.length === 0, "job_match: no tailored outputs");

  const [top, bottom] = output.ranked_jobs;
  assert(top.match.score >= bottom.match.score, "job_match: ranked descending by score");
  assert(
    top.job_id === "job-001-finflow",
    `job_match: FinFlow ranked first (score ${top.match.score} vs ${bottom.match.score})`
  );
  assert(typeof top.match.must_have_coverage_pct === "number", "job_match: must_have_coverage_pct present");
  assert(typeof top.match.explanation === "string" && top.match.explanation.length > 10, "job_match: explanation present");
  assert(["apply", "stretch", "skip"].includes(top.match.recommendation), "job_match: recommendation is valid enum");

  console.log(`\n  Top job: ${top.job_json.company ?? "?"} (score ${top.match.score}, recommendation: ${top.match.recommendation})`);
  console.log(`  Bottom job: ${bottom.job_json.company ?? "?"} (score ${bottom.match.score}, recommendation: ${bottom.match.recommendation})`);

  // Verify early-stop thresholds would apply correctly
  const lowMatchJobs = output.ranked_jobs.filter(
    (rj) => rj.match.score < 55 || rj.match.must_have_coverage_pct < 60
  );
  console.log(`  Jobs that would be skipped for tailoring: ${lowMatchJobs.length}`);
  assert(
    bottom.match.score < 70 || bottom.match.recommendation !== "apply",
    "job_match: ML job is not a strong match for a backend engineer"
  );
}

// ── Test 3: apply_pack (job that passes thresholds) ───────────────────────────

async function testApplyPack(): Promise<void> {
  header("Test 3: apply_pack");

  const output = await runOrchestrator({
    run_type: "apply_pack",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
    candidate_profile: {
      location: "Lagos, Nigeria",
      work_auth: "open_to_relocation",
    },
    jobs: [
      {
        job_id: "job-001-finflow",
        source: "internal",
        raw_text: SAMPLE_JOB_MATCHING,
      },
    ],
    limits: {
      max_tailored_jobs: 1,
      token_budget_total: 60000,
    },
  });

  console.log(`  run_id: ${output.run_id}`);
  console.log(`  tokens used: ${output.budget.token_used_estimate} / ${output.budget.token_budget_total}`);
  console.log(`  stopped_reason: "${output.budget.stopped_reason || "none"}"`);
  console.log(`  ranked jobs: ${output.ranked_jobs.length}`);
  console.log(`  tailored outputs: ${output.tailored_outputs.length}`);

  validateOutput(output, "apply_pack");

  const top = output.ranked_jobs[0];
  if (!top) {
    assert(false, "apply_pack: at least 1 ranked job");
    return;
  }

  const meetsThreshold = top.match.score >= 55 && top.match.must_have_coverage_pct >= 60;
  console.log(`  FinFlow score: ${top.match.score}, must-have coverage: ${top.match.must_have_coverage_pct}%`);
  console.log(`  Meets tailoring threshold: ${meetsThreshold}`);

  if (meetsThreshold) {
    assert(output.tailored_outputs.length === 1, "apply_pack: 1 tailored output produced");

    const tOut = output.tailored_outputs[0];
    if (tOut) {
      // Tailored resume checks
      assert(typeof tOut.tailored_resume.summary === "string" && tOut.tailored_resume.summary.length > 20, "apply_pack: tailored summary present");
      assert(Array.isArray(tOut.tailored_resume.skills) && tOut.tailored_resume.skills.length > 0, "apply_pack: tailored skills present");
      assert(Array.isArray(tOut.tailored_resume.ats_keywords), "apply_pack: ats_keywords present");

      // Cover letter checks
      const cl = tOut.cover_letter_pack;
      assert(typeof cl.subject_line === "string" && cl.subject_line.length > 5, "apply_pack: subject_line present");
      assert(typeof cl.body === "string" && cl.body.length > 100, "apply_pack: cover letter body present");
      assert(typeof cl.word_count === "number" && cl.word_count > 0, "apply_pack: word_count tracked");
      const wordCountActual = cl.body.trim().split(/\s+/).length;
      assert(
        Math.abs(wordCountActual - cl.word_count) < 30,
        `apply_pack: word_count roughly accurate (reported ${cl.word_count}, actual ~${wordCountActual})`
      );

      // Guard checks
      const guard = tOut.guard_report;
      assert(["PASS", "FAIL"].includes(guard.verdict), "apply_pack: guard verdict is PASS or FAIL");
      assert(typeof guard.confidence === "number" && guard.confidence >= 0 && guard.confidence <= 1, "apply_pack: guard confidence 0–1");
      assert(Array.isArray(guard.issues), "apply_pack: guard issues is array");
      assert(Array.isArray(guard.requires_user_confirmation), "apply_pack: requires_user_confirmation is array");

      console.log(`\n  Guard verdict: ${guard.verdict} (confidence ${guard.confidence.toFixed(2)})`);
      console.log(`  Guard issues: ${guard.issues.length}`);
      console.log(`  Requires user confirmation: ${guard.requires_user_confirmation.length} item(s)`);

      if (guard.verdict === "FAIL") {
        console.log(`  ⚠  Guard FAIL — issues:`);
        for (const issue of guard.issues) {
          console.log(`     [${issue.severity}] ${issue.type} in "${issue.field}": "${issue.fabricated_value}"`);
        }
      }
    }
  } else {
    console.log(`  ⚠  FinFlow did not meet thresholds — tailoring correctly skipped`);
    assert(output.tailored_outputs.length === 0, "apply_pack: no tailored output when below threshold");
  }
}

// ── Test 4: Token budget enforcement ─────────────────────────────────────────

async function testBudgetEnforcement(): Promise<void> {
  header("Test 4: Token budget enforcement");

  const output = await runOrchestrator({
    run_type: "job_match",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
    jobs: [
      { job_id: "job-b1", source: "internal", raw_text: SAMPLE_JOB_MATCHING },
      { job_id: "job-b2", source: "internal", raw_text: SAMPLE_JOB_LOW_MATCH },
    ],
    limits: { token_budget_total: 10 }, // absurdly small to trigger early stop
  });

  console.log(`  status: ${output.status}`);
  console.log(`  stopped_reason: "${output.budget.stopped_reason}"`);
  console.log(`  notes: ${output.notes_for_ui.join(" | ")}`);

  assert(output.status === "partial", "budget enforcement: status is partial when budget exceeded");
  assert(output.budget.stopped_reason.length > 0, "budget enforcement: stopped_reason is populated");
}

// ── Test 5: Cache pass-through ────────────────────────────────────────────────

async function testCachePassthrough(): Promise<void> {
  header("Test 5: Cache pass-through (resume_json)");

  // Pre-parsed resume — orchestrator must NOT call ResumeParserAgent
  const firstRun = await runOrchestrator({
    run_type: "resume_review",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
  });

  const tokensBefore = firstRun.budget.token_used_estimate;

  const secondRun = await runOrchestrator({
    run_type: "resume_review",
    user_id: "golden-test-user",
    resume_text: SAMPLE_RESUME,
    cached: { resume_json: firstRun.resume_json },
  });

  console.log(`  First run tokens: ${tokensBefore}`);
  console.log(`  Cached run tokens: ${secondRun.budget.token_used_estimate}`);
  console.log(`  Cache note: ${secondRun.notes_for_ui.find((n) => n.includes("cache")) ?? "(none)"}`);

  assert(secondRun.budget.token_used_estimate === 0, "cache: zero tokens consumed when resume_json cached");
  assert(
    secondRun.notes_for_ui.some((n) => n.includes("cache")),
    "cache: notes_for_ui mentions cache hit"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🧪 AfriTalent Orchestrator — Golden Test Suite");
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log(`   ANTHROPIC_API_KEY set: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\n❌ ANTHROPIC_API_KEY is not set. Export it before running this script.");
    process.exit(1);
  }

  try {
    await testResumeReview();
    await testJobMatch();
    await testApplyPack();
    await testBudgetEnforcement();
    await testCachePassthrough();
  } catch (err) {
    console.error("\n❌ Unexpected test error:", err);
    process.exit(1);
  }

  header("Results");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${passed} assertions passed`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
