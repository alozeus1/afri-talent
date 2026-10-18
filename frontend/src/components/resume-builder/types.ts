import type { GeneratedResume } from "@/lib/api";

export type TemplateId = "classic" | "modern" | "minimal";

export const TEMPLATE_IDS: readonly TemplateId[] = ["classic", "modern", "minimal"] as const;

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
  if (score >= 80) return { bg: "bg-success-soft", text: "text-success", bar: "bg-success" };
  if (score >= 60) return { bg: "bg-warning-soft", text: "text-warning", bar: "bg-warning" };
  return { bg: "bg-danger-soft", text: "text-danger", bar: "bg-danger" };
}
