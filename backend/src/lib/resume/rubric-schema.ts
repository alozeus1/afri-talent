// Wave 5 PR #2 — Zod schemas + types for the ATS rubric scoring API.
//
// The request body schema OMITS any user/candidate identifier — the route
// handler derives it from `req.user.userId` so a candidate can never write
// to another candidate's resume row (security-engineer hard-block).
//
// The response shape uses a `criteria: Array<{ key, ... }>` so future
// rubric dimensions (e.g. seniority_signals, ats_compatibility_format)
// can be added on the backend without forcing a frontend rebuild — agreed
// with frontend-engineer during the Wave 5 contract negotiation.

import { z } from "zod/v4";
import {
  RESUME_CONTENT_MAX_BYTES,
  resumeContentSchema,
  type ResumeContent,
} from "./version-schema.js";

// Combined-payload row-level envelope cap (defense-in-depth on top of
// per-field 256 KB cap and Express body-parser limit). 768 KB allows both
// originalContent + optimizedContent at 256 KB each plus 256 KB headroom
// for the rest of the request envelope and AI metadata.
export const ATS_RUBRIC_ROW_MAX_BYTES = 768 * 1024;

export const atsRubricRequestSchema = z.object({
  resumeContent: resumeContentSchema,
  targetJobId: z.string().uuid().nullable().optional(),
  targetJobDescription: z.string().max(20_000).nullable().optional(),
});

export const rubricCriterionSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100),
  weight: z.number().int().min(0).max(100),
  notes: z.array(z.string().max(500)).max(10),
  present: z.array(z.string().max(120)).max(50).optional(),
  missing: z.array(z.string().max(120)).max(50).optional(),
});

export const atsRubricResponseSchema = z.object({
  resumeVersionId: z.string().uuid().nullable(),
  atsScore: z.number().int().min(0).max(100),
  matchScore: z.number().int().min(0).max(100).nullable(),
  criteria: z.array(rubricCriterionSchema).min(1).max(20),
  suggestions: z.array(z.string().max(500)).max(10),
  optimizedContent: resumeContentSchema.nullable(),
  source: z.enum(["ai", "template"]),
});

export type AtsRubricRequest = z.infer<typeof atsRubricRequestSchema>;
export type AtsRubricResponse = z.infer<typeof atsRubricResponseSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

// Re-exports so the route handler only needs to import from this module.
export { RESUME_CONTENT_MAX_BYTES, type ResumeContent };
