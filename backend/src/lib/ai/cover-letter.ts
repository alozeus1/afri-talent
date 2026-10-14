// ─────────────────────────────────────────────────────────────────────────────
// Lightweight AI Cover Letter Generator
//
// Used by Quick Apply and the auto-apply pipeline to generate job-specific
// cover letters without running the full orchestrator.
//
// Falls back to a template-based letter when AI is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import { getAnthropicClient } from "./anthropic-client.js";
import logger from "../logger.js";

const FAST_MODEL = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface CoverLetterInput {
  candidateName: string;
  headline?: string | null;
  skills: string[];
  bio?: string | null;
  yearsExperience?: number | null;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
}

interface CoverLetterResult {
  coverLetter: string;
  source: "ai" | "template";
}

export async function generateQuickCoverLetter(
  input: CoverLetterInput
): Promise<CoverLetterResult> {
  // Try AI generation first
  if (!AI_DISABLED && !MOCK_AI && process.env.ANTHROPIC_API_KEY) {
    try {
      const letter = await generateWithAI(input);
      return { coverLetter: letter, source: "ai" };
    } catch (err) {
      logger.warn({ err }, "[cover-letter] AI generation failed, using template fallback");
    }
  }

  // Template fallback
  return { coverLetter: generateTemplateCoverLetter(input), source: "template" };
}

async function generateWithAI(input: CoverLetterInput): Promise<string> {
  const client = getAnthropicClient();

  const skillsText = input.skills.slice(0, 10).join(", ");
  const experience = input.yearsExperience
    ? `${input.yearsExperience} years of experience`
    : "relevant experience";

  const prompt = `Write a concise, professional cover letter (150-250 words) for the following application.
The tone should be confident but not arrogant, and specific to the role.
Do NOT use generic filler phrases like "I am writing to express my interest".
Start with a compelling hook about what the candidate brings to this specific role.

CANDIDATE:
- Name: ${input.candidateName}
- Headline: ${input.headline || "Professional"}
- Key Skills: ${skillsText}
- Experience: ${experience}
${input.bio ? `- Summary: ${input.bio.slice(0, 500)}` : ""}

JOB:
- Title: ${input.jobTitle}
- Company: ${input.companyName}
- Description (first 1000 chars): ${input.jobDescription.slice(0, 1000)}

Return ONLY the cover letter text. No salutation, no subject line, no "Dear Hiring Manager" — just the body paragraphs.`;

  const response = await client.messages.create({
    model: FAST_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text.trim();
}

const BIO_MAX_CHARS = 300;

/**
 * Trim a bio to at most `max` characters, cutting at the last sentence
 * boundary inside that window so employers never see a half-word. Falls back
 * to the last word boundary (with an ellipsis) when no sentence ends in range.
 */
export function trimBioAtSentence(bio: string, max = BIO_MAX_CHARS): string {
  const clean = bio.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    /[.!?]$/.test(window) ? window.length - 1 : -1,
  );
  if (sentenceEnd > 0) return window.slice(0, sentenceEnd + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return `${(wordEnd > 0 ? window.slice(0, wordEnd) : window).replace(/[,;:\s]+$/, "")}…`;
}

/**
 * Deterministic cover letter used under MOCK_AI, with no API key, or when the
 * AI call fails. Every optional input (skills, bio, headline, experience) is
 * dropped cleanly when empty: no dangling "in ," clauses or double spaces.
 */
export function generateTemplateCoverLetter(input: CoverLetterInput): string {
  const skills = input.skills.map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const skillsText = skills.join(", ");
  const headline = input.headline?.trim().replace(/[.\s]+$/, "");
  const bio = input.bio?.trim() ? trimBioAtSentence(input.bio) : "";

  const lead = input.yearsExperience
    ? `With ${input.yearsExperience} years of experience${skillsText ? ` in ${skillsText}` : ""}`
    : skillsText
      ? `With my background in ${skillsText}`
      : "With my background and experience";

  const paragraphs = [
    `${lead}, I am well-positioned to contribute to the ${input.jobTitle} role at ${input.companyName}.`,
    `${headline ? `${headline}. ` : ""}My experience aligns closely with the requirements of this position, and I bring a strong track record of delivering results and collaborating effectively with cross-functional teams.`,
    bio ||
      (skillsText
        ? `I am excited to apply my skills in ${skillsText} to drive impact at ${input.companyName}.`
        : `I am excited to bring my experience to ${input.companyName} and make a meaningful impact.`),
    "I would welcome the opportunity to discuss how my background and skills can contribute to your team's success.",
  ];

  return paragraphs.map((p) => p.replace(/ {2,}/g, " ").trim()).join("\n\n");
}
