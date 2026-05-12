// Wave 5 PR #1 — Zod schemas for the ResumeVersion / CandidateResumeVersion
// tailoring payloads.
//
// PR #2 (ATS rubric scoring service) and the future resume-builder route
// (consumed by frontend PR #3) import from here so the wire contract is the
// single source of truth for resume content + ATS / match score persistence.
//
// `content`, `originalContent` and `optimizedContent` are stored as Prisma
// JSONB columns; we model them here as a loose record so the resume-builder
// AI skill can evolve its output shape without a schema migration.

import { z } from "zod/v4";

export const resumeContentSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Resume body content. Loose JSON shape — the resume-builder AI skill owns the canonical schema and may add fields without migrations."
  );

export const resumeVersionScoresSchema = z.object({
  atsScore: z.number().int().min(0).max(100).nullable().optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
});

export const resumeVersionCreateSchema = z.object({
  candidateId: z.string().uuid(),
  targetJobId: z.string().uuid().nullable().optional(),
  originalContent: resumeContentSchema.nullable().optional(),
  optimizedContent: resumeContentSchema.nullable().optional(),
  atsScore: z.number().int().min(0).max(100).nullable().optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
});

export const resumeVersionUpdateSchema = resumeVersionCreateSchema
  .partial()
  .omit({ candidateId: true });

export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type ResumeVersionScores = z.infer<typeof resumeVersionScoresSchema>;
export type ResumeVersionCreate = z.infer<typeof resumeVersionCreateSchema>;
export type ResumeVersionUpdate = z.infer<typeof resumeVersionUpdateSchema>;
