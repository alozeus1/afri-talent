// ─────────────────────────────────────────────────────────────────────────────
// Application Writer AI Agent
//
// Generates a personalised cover letter from the candidate's resume content and
// a specific job description. Wraps the existing cover-letter.ts with richer
// context from the user's saved resume data.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";

const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface ApplicationWriterInput {
  candidateName: string;
  resumeText: string;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string;
}

export interface GeneratedApplication {
  coverLetter: string;
  source: "ai" | "template";
}

export async function writeCoverLetter(
  input: ApplicationWriterInput
): Promise<GeneratedApplication> {
  if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
    return { coverLetter: buildTemplate(input), source: "template" };
  }

  try {
    const coverLetter = await generateWithClaude(input);
    return { coverLetter, source: "ai" };
  } catch (err) {
    logger.warn({ err }, "[application-writer] AI generation failed, using template fallback");
    return { coverLetter: buildTemplate(input), source: "template" };
  }
}

async function generateWithClaude(input: ApplicationWriterInput): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are an expert career coach and professional writer.

Write a compelling, personalised cover letter for ${input.candidateName} applying to the role of "${input.jobTitle}" at ${input.jobCompany}.

CANDIDATE RESUME:
${input.resumeText.slice(0, 3000)}

JOB DESCRIPTION:
${input.jobDescription.slice(0, 2000)}

Requirements:
- 3 clear paragraphs, 180-250 words total
- Opening: hook that connects the candidate's strongest relevant achievement to this specific role
- Middle: 2-3 specific ways their background matches the job requirements
- Closing: confident call to action
- Professional but warm tone — not generic
- No "Dear Hiring Manager", no "I am writing to express my interest"
- No salutation or sign-off — return body paragraphs only
- Reference specific details from the job description`;

  const response = await client.messages.create({
    model: QUALITY_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");
  return content.text.trim();
}

function buildTemplate(input: ApplicationWriterInput): string {
  return `With a background that aligns closely with the requirements for the ${input.jobTitle} role at ${input.jobCompany}, I am confident in my ability to make an immediate and meaningful contribution to your team.

My experience encompasses the core skills and responsibilities outlined in the position. I have consistently delivered strong results throughout my career and bring a collaborative approach that complements high-performing teams.

I would welcome the opportunity to discuss how my background can help drive success at ${input.jobCompany}. I am excited about the impact this role would allow me to make.`;
}
