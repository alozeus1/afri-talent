// Salary Negotiator — Africa-aware negotiation guidance

import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";

const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface SalaryNegotiationInput {
  role: string;
  location: string; // city, country
  yearsExperience: number;
  offeredSalary?: number;
  offeredCurrency?: string;
  targetSalary?: number;
  skills?: string[];
}

export interface SalaryNegotiationResult {
  recommendedRange: { min: number; max: number; currency: string };
  talkingPoints: string[];
  benefitsToNegotiate: string[];
  negotiationScript: string;
  source: "ai" | "template";
}

export async function generateNegotiationGuidance(
  input: SalaryNegotiationInput
): Promise<SalaryNegotiationResult> {
  if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
    return buildNegotiationMock(input);
  }

  try {
    return await generateWithClaude(input);
  } catch (err) {
    logger.warn({ err }, "[salary-negotiator] AI failed, using mock");
    return buildNegotiationMock(input);
  }
}

async function generateWithClaude(input: SalaryNegotiationInput): Promise<SalaryNegotiationResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a salary negotiation expert with deep knowledge of African job markets.

ROLE: ${input.role}
LOCATION: ${input.location}
EXPERIENCE: ${input.yearsExperience} years
${input.offeredSalary ? `OFFERED SALARY: ${input.offeredSalary} ${input.offeredCurrency || "USD"}` : ""}
${input.targetSalary ? `TARGET SALARY: ${input.targetSalary}` : ""}
${input.skills?.length ? `KEY SKILLS: ${input.skills.join(", ")}` : ""}

Provide practical, market-aware salary negotiation guidance. Return ONLY valid JSON:
{
  "recommendedRange": { "min": <number>, "max": <number>, "currency": "<3-letter code>" },
  "talkingPoints": ["<3-5 specific negotiation talking points>"],
  "benefitsToNegotiate": ["<3-5 benefits beyond base salary>"],
  "negotiationScript": "<A 3-4 sentence script for asking for more compensation>"
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
  if (!jsonMatch) throw new Error("No JSON in salary negotiator response");

  const parsed = JSON.parse(jsonMatch[0]) as Omit<SalaryNegotiationResult, "source">;
  return { ...parsed, source: "ai" };
}

function buildNegotiationMock(input: SalaryNegotiationInput): SalaryNegotiationResult {
  const base = input.offeredSalary ?? 50000;
  return {
    recommendedRange: {
      min: Math.round(base * 1.1),
      max: Math.round(base * 1.25),
      currency: input.offeredCurrency ?? "USD",
    },
    talkingPoints: [
      `My ${input.yearsExperience} years of experience exceeds the typical requirement`,
      "I bring specialized skills that directly address your team's needs",
      "Market research supports a higher range for this role in this market",
    ],
    benefitsToNegotiate: [
      "Remote work flexibility",
      "Professional development budget",
      "Additional vacation days",
      "Performance review timeline",
    ],
    negotiationScript: `Thank you for the offer. Based on my ${input.yearsExperience} years of experience and the current market for ${input.role} roles in ${input.location}, I was expecting a range closer to [X-Y]. Is there flexibility to adjust the base compensation?`,
    source: "template",
  };
}
