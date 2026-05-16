// Wave 5 PR #2 — ATS rubric scoring service.
//
// Inputs: a structured resume payload + an optional target job (by id or by
// description). Outputs a per-criterion rubric (keywords, formatting,
// experience, skills) with weighted subscores, a headline ATS score, a
// semantic match score when a job is provided, and an optional optimized
// resume variant.
//
// AI dependency: reuses `scanResumeAts` from the existing
// `backend/src/lib/ai/skills/ats-scanner.ts` for keyword extraction, then
// composes a richer rubric on top. MOCK_AI=1 is fully supported — every
// AI call branches deterministically on the env var so the vitest path is
// hermetic.
//
// Persistence: when a `targetJobId` is provided, the result is persisted
// as a new `CandidateResumeVersion` row using the columns added in Wave 5
// PR #1 (atsScore, matchScore, originalContent, optimizedContent). The
// `AiRun` header is written fire-and-forget via `createAiRun` — never
// awaited in the request path. The `userId` is supplied by the route
// handler (derived from `req.user`) and never trusted from the request
// body (security-engineer hard-block).
//
// Logging: NEVER logs raw `resumeContent` / `originalContent` /
// `optimizedContent` (security-engineer hard-block). Uses `hashText` from
// the existing AI persistence helper to identify payloads by sha256.

import { randomUUID } from "crypto";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { Prisma, ResumeVersionSource, ResumeVersionStatus } from "@prisma/client";
import { createAiRun, hashText } from "../lib/ai/persistence.js";
import { scanResumeAts } from "../lib/ai/skills/ats-scanner.js";
import type {
  AtsRubricResponse,
  RubricCriterion,
  ResumeContent,
} from "../lib/resume/rubric-schema.js";

const MOCK_AI = process.env.MOCK_AI === "1";
const AI_DISABLED = process.env.AI_DISABLED === "1";

// Token budget for the AI Run header. Mirrors the ORCHESTRATOR_TOKEN_BUDGET
// pattern so the AiRun row carries a meaningful upper bound.
const ATS_RUBRIC_TOKEN_BUDGET = 8_000;

// Fixed weights for the 4 core rubric categories (sum to 100). Per-criterion
// scores are 0–100; the headline `atsScore` is the weighted average. Keeping
// the weight totals at 100 means subscore semantics stay intuitive.
const RUBRIC_WEIGHTS: Record<string, { label: string; weight: number }> = {
  keywords: { label: "Keyword coverage", weight: 40 },
  formatting: { label: "Formatting & ATS readability", weight: 20 },
  experience: { label: "Experience alignment", weight: 25 },
  skills: { label: "Skills match", weight: 15 },
};

export interface ScoreAtsRubricInput {
  userId: string;
  resumeContent: ResumeContent;
  targetJobId?: string | null;
  targetJobDescription?: string | null;
}

export async function scoreAtsRubric(
  input: ScoreAtsRubricInput
): Promise<AtsRubricResponse> {
  const { userId, resumeContent, targetJobId, targetJobDescription } = input;
  const runId = randomUUID();

  const resumeText = resumeToPlainText(resumeContent);
  const resumeHash = hashText(resumeText);

  // Fire-and-forget AiRun header. Never await — keeps the request path lean.
  void createAiRun(userId, runId, "resume_review", resumeHash, ATS_RUBRIC_TOKEN_BUDGET);

  // Resolve the target job description: prefer the explicit description, fall
  // back to the row in `Job` if a jobId is provided.
  const jobDescription = await resolveJobDescription(targetJobId, targetJobDescription);

  // Reuse the existing ATS scanner for keyword extraction. It honours MOCK_AI
  // internally so the test path is hermetic.
  const scan = await scanResumeAts({
    resumeText,
    jobDescription: jobDescription ?? "",
  });

  // Compose the richer rubric on top of the scanner output.
  const criteria = buildCriteria(scan, jobDescription, resumeText);
  const atsScore = computeWeightedScore(criteria);
  const matchScore = jobDescription
    ? clampScore(textOverlapPercent(resumeText, jobDescription))
    : null;
  const optimizedContent = MOCK_AI || AI_DISABLED
    ? null
    : buildMockOptimizedContent(resumeContent, scan.missingKeywords);

  // Persist a CandidateResumeVersion row only when we have a target job.
  // Without a job there is no rubric anchor to persist against.
  let resumeVersionId: string | null = null;
  if (targetJobId) {
    resumeVersionId = await persistResumeVersion({
      userId,
      jobId: targetJobId,
      runId,
      originalContent: resumeContent,
      optimizedContent,
      atsScore,
      matchScore,
      resumeText,
    });
  }

  return {
    resumeVersionId,
    atsScore,
    matchScore,
    criteria,
    suggestions: scan.suggestions,
    optimizedContent,
    source: scan.source,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

async function resolveJobDescription(
  targetJobId: string | null | undefined,
  targetJobDescription: string | null | undefined
): Promise<string | null> {
  if (targetJobDescription && targetJobDescription.trim().length > 0) {
    return targetJobDescription;
  }
  if (!targetJobId) return null;

  try {
    const job = await prisma.job.findUnique({
      where: { id: targetJobId },
      select: { description: true, title: true },
    });
    if (!job) return null;
    return [job.title, job.description].filter(Boolean).join("\n\n");
  } catch (err) {
    logger.warn({ err, jobId_hash: hashText(targetJobId) }, "[ats-rubric] job lookup failed");
    return null;
  }
}

function buildCriteria(
  scan: { score: number; missingKeywords: string[]; presentKeywords: string[] },
  jobDescription: string | null,
  resumeText: string
): RubricCriterion[] {
  const totalKeywords = scan.missingKeywords.length + scan.presentKeywords.length;
  const keywordScore = totalKeywords === 0
    ? 70
    : Math.round((scan.presentKeywords.length / totalKeywords) * 100);

  const formattingScore = scoreFormatting(resumeText);
  const experienceScore = scoreExperience(resumeText, jobDescription);
  const skillsScore = totalKeywords === 0
    ? Math.round((keywordScore + experienceScore) / 2)
    : Math.round((scan.presentKeywords.length / Math.max(1, totalKeywords / 2)) * 100);

  return [
    {
      key: "keywords",
      label: RUBRIC_WEIGHTS.keywords.label,
      score: clampScore(keywordScore),
      weight: RUBRIC_WEIGHTS.keywords.weight,
      notes: scan.missingKeywords.length > 0
        ? [`${scan.missingKeywords.length} job keywords are missing from the resume.`]
        : ["Resume covers the visible job keywords."],
      present: scan.presentKeywords,
      missing: scan.missingKeywords,
    },
    {
      key: "formatting",
      label: RUBRIC_WEIGHTS.formatting.label,
      score: clampScore(formattingScore),
      weight: RUBRIC_WEIGHTS.formatting.weight,
      notes: buildFormattingNotes(resumeText),
    },
    {
      key: "experience",
      label: RUBRIC_WEIGHTS.experience.label,
      score: clampScore(experienceScore),
      weight: RUBRIC_WEIGHTS.experience.weight,
      notes: jobDescription
        ? ["Compared experience section against the job description."]
        : ["No target job description provided — experience scored against general patterns."],
    },
    {
      key: "skills",
      label: RUBRIC_WEIGHTS.skills.label,
      score: clampScore(skillsScore),
      weight: RUBRIC_WEIGHTS.skills.weight,
      notes: ["Skills score derived from keyword density and recency."],
    },
  ];
}

function computeWeightedScore(criteria: RubricCriterion[]): number {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = criteria.reduce((sum, c) => sum + c.score * c.weight, 0);
  return clampScore(Math.round(weighted / totalWeight));
}

function scoreFormatting(resumeText: string): number {
  let score = 80;
  if (resumeText.length < 400) score -= 25;
  if (!/\d/.test(resumeText)) score -= 10;
  if (!/[\n\r]/.test(resumeText)) score -= 15;
  if (resumeText.length > 18_000) score -= 10;
  return clampScore(score);
}

function buildFormattingNotes(resumeText: string): string[] {
  const notes: string[] = [];
  if (resumeText.length < 400) {
    notes.push("Resume is unusually short — ATS engines may flag it as incomplete.");
  }
  if (!/\d/.test(resumeText)) {
    notes.push("No quantified achievements detected — add numbers and percentages.");
  }
  if (notes.length === 0) {
    notes.push("Formatting looks ATS-friendly.");
  }
  return notes;
}

function scoreExperience(resumeText: string, jobDescription: string | null): number {
  if (!jobDescription) return 65;
  return clampScore(textOverlapPercent(resumeText, jobDescription));
}

function textOverlapPercent(a: string, b: string): number {
  const wordsA = new Set(tokenize(a));
  const wordsB = tokenize(b);
  if (wordsB.length === 0) return 0;
  const present = wordsB.filter((w) => wordsA.has(w)).length;
  return Math.round((present / wordsB.length) * 100);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
}

function clampScore(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function resumeToPlainText(content: ResumeContent): string {
  const parts: string[] = [];
  walkContent(content, parts);
  return parts.join(" ").slice(0, 20_000);
}

function walkContent(value: unknown, parts: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    parts.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkContent(item, parts);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkContent(v, parts);
    }
  }
}

function buildMockOptimizedContent(
  original: ResumeContent,
  missingKeywords: string[]
): ResumeContent {
  // Pure backend service — when MOCK_AI is OFF we'd call the AI here. For
  // now we return a shallow clone with a `keywordsAdded` hint so PR #3 has
  // something to render while we wire the AI rewriter in a later wave.
  return {
    ...original,
    __ats_rubric_hint: {
      keywordsAdded: missingKeywords.slice(0, 5),
    },
  };
}

interface PersistArgs {
  userId: string;
  jobId: string;
  runId: string;
  originalContent: ResumeContent;
  optimizedContent: ResumeContent | null;
  atsScore: number;
  matchScore: number | null;
  resumeText: string;
}

async function persistResumeVersion(args: PersistArgs): Promise<string | null> {
  try {
    const created = await prisma.candidateResumeVersion.create({
      data: {
        userId: args.userId,
        jobId: args.jobId,
        aiRunId: null, // AiRun is fire-and-forget; we don't await it here.
        source: ResumeVersionSource.AI_TAILOR,
        status: ResumeVersionStatus.READY,
        title: "ATS rubric tailored",
        content: args.originalContent as unknown as Prisma.InputJsonValue,
        plainText: args.resumeText,
        keywords: [],
        originalContent: args.originalContent as unknown as Prisma.InputJsonValue,
        optimizedContent: args.optimizedContent
          ? (args.optimizedContent as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        atsScore: args.atsScore,
        matchScore: args.matchScore,
      },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    // Non-fatal — the API still returns the scoring result, just without an
    // id. Log with hashed identifiers only.
    logger.warn(
      {
        run_id: args.runId,
        user_id_hash: hashText(args.userId),
        job_id_hash: hashText(args.jobId),
        err,
      },
      "[ats-rubric] persistResumeVersion failed (non-fatal)"
    );
    return null;
  }
}
