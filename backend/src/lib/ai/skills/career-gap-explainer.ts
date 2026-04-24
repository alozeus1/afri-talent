// Career Gap Explainer — helps African job seekers reframe career gaps positively

import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";

const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";

export interface CareerGapInput {
  resumeText: string;
  gapStartDate: string;
  gapEndDate: string;
  context?: string; // User's own explanation of the gap
  targetRole?: string;
}

export interface CareerGapResult {
  explanation: string;
  framing: string;
  talkingPoints: string[];
  source: "ai" | "template";
}

export async function explainCareerGap(input: CareerGapInput): Promise<CareerGapResult> {
  if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
    return buildGapMock(input);
  }

  try {
    return await generateWithClaude(input);
  } catch (err) {
    logger.warn({ err }, "[career-gap-explainer] AI failed, using mock");
    return buildGapMock(input);
  }
}

async function generateWithClaude(input: CareerGapInput): Promise<CareerGapResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are a career coach specializing in helping African professionals navigate career gaps.
Many African job seekers have gaps due to economic conditions, family obligations, or market factors — help them present these positively.

RESUME CONTEXT: ${input.resumeText.slice(0, 2000)}
GAP PERIOD: ${input.gapStartDate} to ${input.gapEndDate}
CANDIDATE'S CONTEXT: ${input.context || "Not provided"}
${input.targetRole ? `TARGET ROLE: ${input.targetRole}` : ""}

Create a professional, honest, and positive framing of this career gap. Return ONLY valid JSON:
{
  "explanation": "<A professional 2-3 sentence explanation suitable for a cover letter>",
  "framing": "<A brief positive reframe of what was accomplished or learned during this period>",
  "talkingPoints": ["<3-4 specific talking points for interviews about this gap>"]
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
  if (!jsonMatch) throw new Error("No JSON in gap explainer response");

  const parsed = JSON.parse(jsonMatch[0]) as Omit<CareerGapResult, "source">;
  return { ...parsed, source: "ai" };
}

function buildGapMock(input: CareerGapInput): CareerGapResult {
  return {
    explanation: `During ${input.gapStartDate} to ${input.gapEndDate}, I took time to ${input.context || "focus on personal development and skill building"}. This period strengthened my resolve and clarity about my career direction.`,
    framing: "Used this time for intentional growth, skill development, and preparation for my next role.",
    talkingPoints: [
      "Stayed current with industry developments through online learning",
      "Developed new skills relevant to my target role",
      "Used the time for deliberate career reflection and goal-setting",
      "Maintained professional network and industry connections",
    ],
    source: "template",
  };
}
