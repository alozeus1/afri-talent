// Interview Answer Evaluator — STAR method scoring + actionable feedback
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";
const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
export async function evaluateInterviewAnswer(input) {
    if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
        return buildEvalMock(input);
    }
    try {
        return await generateWithClaude(input);
    }
    catch (err) {
        logger.warn({ err }, "[interview-answer-evaluator] AI failed, using mock");
        return buildEvalMock(input);
    }
}
async function generateWithClaude(input) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `You are an expert interview coach. Evaluate this interview answer.

QUESTION: ${input.question}

CANDIDATE'S ANSWER: ${input.candidateAnswer.slice(0, 2000)}

EXPECTED KEY POINTS: ${input.expectedPoints.join(", ")}
${input.role ? `ROLE: ${input.role}` : ""}

Score using STAR method (Situation, Task, Action, Result). Return ONLY valid JSON:
{
  "score": <0-100>,
  "feedback": "<2-3 sentence overall feedback>",
  "suggestedAnswer": "<a strong model answer for this question>",
  "talkingPoints": ["<3-5 key points to mention>"],
  "strengths": ["<what was done well, max 3>"],
  "improvements": ["<specific improvements, max 3>"]
}`;
    const response = await client.messages.create({
        model: QUALITY_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0];
    if (content.type !== "text")
        throw new Error("Unexpected Claude response type");
    const text = content.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
        throw new Error("No JSON in answer evaluator response");
    const parsed = JSON.parse(jsonMatch[0]);
    return { ...parsed, score: Math.min(100, Math.max(0, parsed.score)), source: "ai" };
}
function buildEvalMock(input) {
    const hasSTAR = input.candidateAnswer.length > 100;
    return {
        score: hasSTAR ? 65 : 45,
        feedback: hasSTAR
            ? "Good attempt. Your answer shows relevant experience but could benefit from more specific metrics."
            : "Your answer is brief. Try using the STAR method: Situation, Task, Action, Result.",
        suggestedAnswer: `When answering "${input.question}", use the STAR method. Describe a specific situation, your role and responsibilities, the actions you took, and the measurable results you achieved.`,
        talkingPoints: input.expectedPoints,
        strengths: ["Relevant experience mentioned"],
        improvements: ["Add specific metrics", "Use STAR structure", "Be more concise"],
        source: "template",
    };
}
//# sourceMappingURL=interview-answer-evaluator.js.map