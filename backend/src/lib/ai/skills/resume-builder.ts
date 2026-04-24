// ─────────────────────────────────────────────────────────────────────────────
// Resume Builder AI Agent
//
// Generates an ATS-optimised professional resume from structured candidate
// input using Claude. Returns plain-text export and structured JSON sections.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";

const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface ResumeInput {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  targetRole: string;
  yearsExperience: number;
  summary?: string;
  skills: string[];
  workHistory: Array<{
    company: string;
    title: string;
    period: string;
    description?: string;
  }>;
  educationHistory: Array<{
    institution: string;
    degree: string;
    period?: string;
  }>;
  certifications?: string[];
}

export interface GeneratedResume {
  sections: {
    summary: string;
    skills: string[];
    experience: Array<{
      company: string;
      title: string;
      period: string;
      bullets: string[];
    }>;
    education: Array<{
      institution: string;
      degree: string;
      period: string;
    }>;
    certifications: string[];
  };
  rawText: string;
  source: "ai" | "template";
}

export async function buildResume(input: ResumeInput): Promise<GeneratedResume> {
  if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
    return buildTemplateResume(input);
  }

  try {
    return await buildWithAI(input);
  } catch (err) {
    logger.warn({ err }, "[resume-builder] AI generation failed, using template fallback");
    return buildTemplateResume(input);
  }
}

async function buildWithAI(input: ResumeInput): Promise<GeneratedResume> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const workHistoryText = input.workHistory
    .map(
      (w) =>
        `Company: ${w.company}\nTitle: ${w.title}\nPeriod: ${w.period}\nDescription: ${w.description || "Not provided"}`
    )
    .join("\n\n");

  const educationText = input.educationHistory
    .map((e) => `${e.degree} — ${e.institution}${e.period ? ` (${e.period})` : ""}`)
    .join("\n");

  const prompt = `You are an expert resume writer and career coach specialising in African tech and professional markets.

Build a compelling, ATS-optimised resume for the candidate below targeting the role of "${input.targetRole}".

CANDIDATE INFO:
Name: ${input.fullName}
Email: ${input.email}
${input.phone ? `Phone: ${input.phone}` : ""}
${input.location ? `Location: ${input.location}` : ""}
Years of Experience: ${input.yearsExperience}
${input.summary ? `Personal Summary: ${input.summary}` : ""}

SKILLS: ${input.skills.join(", ")}

WORK HISTORY:
${workHistoryText}

EDUCATION:
${educationText}

${input.certifications?.length ? `CERTIFICATIONS:\n${input.certifications.join("\n")}` : ""}

Return ONLY valid JSON (no markdown, no explanation) matching this schema exactly:
{
  "summary": "3-4 sentence ATS-optimised professional summary tailored to ${input.targetRole}",
  "skills": ["top 12 skills, prioritised for ${input.targetRole} ATS keywords"],
  "experience": [
    {
      "company": "company name",
      "title": "job title",
      "period": "period as given",
      "bullets": ["3-5 strong STAR-format achievement bullets for each role"]
    }
  ],
  "education": [
    { "institution": "...", "degree": "...", "period": "..." }
  ],
  "certifications": ["list of certifications"]
}

Rules:
- Use strong action verbs (Led, Built, Drove, Scaled, Reduced, Improved)
- Quantify achievements where data can be inferred
- Avoid generic phrases
- Keep bullets concise (max 20 words each)
- Prioritise impact over responsibilities`;

  const response = await client.messages.create({
    model: QUALITY_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");

  const text = content.text.trim();
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = match ? match[1].trim() : text;
  const sections = JSON.parse(jsonStr) as GeneratedResume["sections"];

  return {
    sections,
    rawText: sectionsToText(input.fullName, input.email, input.phone, input.location, sections),
    source: "ai",
  };
}

function buildTemplateResume(input: ResumeInput): GeneratedResume {
  const sections: GeneratedResume["sections"] = {
    summary: input.summary
      || `${input.yearsExperience}+ year${input.yearsExperience !== 1 ? "s" : ""} professional with expertise in ${input.skills.slice(0, 3).join(", ")} seeking a ${input.targetRole} role.`,
    skills: input.skills.slice(0, 12),
    experience: input.workHistory.map((w) => ({
      company: w.company,
      title: w.title,
      period: w.period,
      bullets: w.description
        ? w.description.split(".").filter(Boolean).slice(0, 4).map((s) => s.trim())
        : [`Contributed to core ${w.title} responsibilities at ${w.company}`],
    })),
    education: input.educationHistory.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      period: e.period || "",
    })),
    certifications: input.certifications || [],
  };

  return {
    sections,
    rawText: sectionsToText(input.fullName, input.email, input.phone, input.location, sections),
    source: "template",
  };
}

function sectionsToText(
  name: string,
  email: string,
  phone: string | undefined,
  location: string | undefined,
  sections: GeneratedResume["sections"]
): string {
  const lines: string[] = [];

  lines.push(name.toUpperCase());
  lines.push([email, phone, location].filter(Boolean).join(" | "));
  lines.push("");
  lines.push("PROFESSIONAL SUMMARY");
  lines.push("─".repeat(40));
  lines.push(sections.summary);
  lines.push("");
  lines.push("SKILLS");
  lines.push("─".repeat(40));
  lines.push(sections.skills.join(" • "));
  lines.push("");
  lines.push("PROFESSIONAL EXPERIENCE");
  lines.push("─".repeat(40));
  for (const exp of sections.experience) {
    lines.push(`${exp.title} — ${exp.company} (${exp.period})`);
    for (const bullet of exp.bullets) {
      lines.push(`  • ${bullet}`);
    }
    lines.push("");
  }
  lines.push("EDUCATION");
  lines.push("─".repeat(40));
  for (const edu of sections.education) {
    lines.push(`${edu.degree} — ${edu.institution}${edu.period ? ` (${edu.period})` : ""}`);
  }
  if (sections.certifications.length > 0) {
    lines.push("");
    lines.push("CERTIFICATIONS");
    lines.push("─".repeat(40));
    for (const cert of sections.certifications) {
      lines.push(`  • ${cert}`);
    }
  }

  return lines.join("\n");
}
