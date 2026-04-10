// ATS Resume Scanner — checks resume against job description for keyword gaps

import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";

const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface AtsScanInput {
  resumeText: string;
  jobDescription: string;
}

export interface AtsScanResult {
  score: number; // 0-100
  missingKeywords: string[];
  presentKeywords: string[];
  suggestions: string[];
  source: "ai" | "template";
}

export async function scanResumeAts(input: AtsScanInput): Promise<AtsScanResult> {
  if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
    return buildAtsMock(input);
  }

  try {
    return await generateWithClaude(input);
  } catch (err) {
    logger.warn({ err }, "[ats-scanner] AI failed, using mock fallback");
    return buildAtsMock(input);
  }
}

async function generateWithClaude(input: AtsScanInput): Promise<AtsScanResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are an ATS (Applicant Tracking System) expert. Analyze the resume against the job description.

RESUME:
${input.resumeText.slice(0, 4000)}

JOB DESCRIPTION:
${input.jobDescription.slice(0, 2000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "score": <integer 0-100 representing ATS match percentage>,
  "missingKeywords": [<keywords in job description NOT found in resume, max 15>],
  "presentKeywords": [<important keywords found in both, max 15>],
  "suggestions": [<3-5 specific actionable suggestions to improve ATS score>]
}`;

  const response = await client.messages.create({
    model: QUALITY_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");

  const text = content.text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in ATS scan response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    score: number;
    missingKeywords: string[];
    presentKeywords: string[];
    suggestions: string[];
  };

  return {
    score: Math.min(100, Math.max(0, Math.round(parsed.score))),
    missingKeywords: parsed.missingKeywords ?? [],
    presentKeywords: parsed.presentKeywords ?? [],
    suggestions: parsed.suggestions ?? [],
    source: "ai",
  };
}

function buildAtsMock(input: AtsScanInput): AtsScanResult {
  const resumeWords = new Set(input.resumeText.toLowerCase().split(/\W+/));
  const jobWords = input.jobDescription.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const unique = [...new Set(jobWords)];
  const present = unique.filter((w) => resumeWords.has(w)).slice(0, 10);
  const missing = unique.filter((w) => !resumeWords.has(w)).slice(0, 10);
  const score = Math.round((present.length / Math.max(1, present.length + missing.length)) * 100);

  return {
    score,
    missingKeywords: missing,
    presentKeywords: present,
    suggestions: [
      "Add missing keywords from the job description to your resume.",
      "Quantify achievements with numbers and percentages.",
      "Mirror the exact job title used in the posting.",
    ],
    source: "template",
  };
}
