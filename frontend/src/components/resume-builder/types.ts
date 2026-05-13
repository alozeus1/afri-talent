import type { GeneratedResume } from "@/lib/api";

export type TemplateId = "classic" | "modern" | "minimal";

export const TEMPLATE_IDS: readonly TemplateId[] = ["classic", "modern", "minimal"] as const;

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly TemplateMeta[] = [
  { id: "classic", label: "Classic", description: "Serif, single-column, ATS-safe." },
  { id: "modern", label: "Modern", description: "Sans-serif with a two-column header." },
  { id: "minimal", label: "Minimal", description: "Tight monoline, single-column, no color." },
] as const;

export interface ResumePreviewData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  targetRole: string;
  yearsExperience: string;
  summary: string;
  skills: string[];
  certifications: string[];
  workHistory: Array<{ company: string; title: string; period: string; description: string }>;
  educationHistory: Array<{ institution: string; degree: string; period: string }>;
  // After generation, templates render this rawText verbatim in a <pre> block
  // so the user sees the AI's output instead of the per-field layout.
  generatedRawText?: string;
  generatedSource?: GeneratedResume["source"];
}

export interface RubricSwatchTone {
  bg: string;
  text: string;
  bar: string;
}

export function rubricSwatch(score: number): RubricSwatchTone {
  if (score >= 80) return { bg: "bg-emerald-50", text: "text-emerald-900", bar: "bg-emerald-500" };
  if (score >= 60) return { bg: "bg-amber-50", text: "text-amber-900", bar: "bg-amber-500" };
  return { bg: "bg-red-50", text: "text-red-900", bar: "bg-red-500" };
}
