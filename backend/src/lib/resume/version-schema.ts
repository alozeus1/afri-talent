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

// Defense-in-depth cap on serialized resume content size. The route layer
// still enforces rate limiting + per-user quotas + auth-derived candidateId,
// but this stops a payload from blowing past a reasonable JSONB row size
// before it ever reaches Prisma. 256 KB comfortably fits any real resume
// (typical AI-tailored output is < 20 KB) while keeping the Aurora row
// inside the 8 KB / TOAST-friendly range plus headroom for AI rewrites.
export const RESUME_CONTENT_MAX_BYTES = 256 * 1024;

export const resumeContentSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => {
      try {
        return Buffer.byteLength(JSON.stringify(value), "utf8") <= RESUME_CONTENT_MAX_BYTES;
      } catch {
        // JSON.stringify throws on circular references — treat as invalid.
        return false;
      }
    },
    {
      message: `Resume content exceeds ${RESUME_CONTENT_MAX_BYTES} bytes when serialized as JSON`,
    }
  )
  .describe(
    "Resume body content. Loose JSON shape — the resume-builder AI skill owns the canonical schema and may add fields without migrations. Capped at 256 KB serialized."
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
