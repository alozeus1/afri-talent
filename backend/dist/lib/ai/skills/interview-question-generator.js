// Interview Question Generator — role and difficulty aware
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";
const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
export async function generateInterviewQuestions(input) {
    if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
        return buildQuestionsMock(input);
    }
    try {
        return await generateWithClaude(input);
    }
    catch (err) {
        logger.warn({ err }, "[interview-question-generator] AI failed, using mock");
        return buildQuestionsMock(input);
    }
}
async function generateWithClaude(input) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const count = Math.min(input.count, 10);
    const prompt = `Generate ${count} interview questions for a ${input.difficulty} difficulty ${input.role} interview.
${input.jobDescription ? `Job context: ${input.jobDescription.slice(0, 500)}` : ""}

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "question": "<interview question>",
      "category": "<behavioral|technical|situational|cultural>",
      "difficulty": "${input.difficulty}",
      "expectedPoints": ["<key point 1>", "<key point 2>", "<key point 3>"]
    }
  ]
}`;
    const response = await client.messages.create({
        model: QUALITY_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0];
    if (content.type !== "text")
        throw new Error("Unexpected Claude response type");
    const text = content.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
        throw new Error("No JSON in question generator response");
    const parsed = JSON.parse(jsonMatch[0]);
    return { questions: parsed.questions ?? [], source: "ai" };
}
function buildQuestionsMock(input) {
    const questions = [
        {
            question: `Tell me about your experience as a ${input.role}.`,
            category: "behavioral",
            difficulty: input.difficulty,
            expectedPoints: ["Specific examples", "Measurable outcomes", "Lessons learned"],
        },
        {
            question: "Describe a challenging project and how you handled it.",
            category: "situational",
            difficulty: input.difficulty,
            expectedPoints: ["STAR method", "Clear problem statement", "Your specific actions"],
        },
        {
            question: "Where do you see yourself in 5 years?",
            category: "behavioral",
            difficulty: input.difficulty,
            expectedPoints: ["Career alignment", "Growth mindset", "Company fit"],
        },
    ];
    return { questions: questions.slice(0, input.count), source: "template" };
}
//# sourceMappingURL=interview-question-generator.js.map