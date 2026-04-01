// ─────────────────────────────────────────────────────────────────────────────
// Lightweight AI Cover Letter Generator
//
// Used by Quick Apply and the auto-apply pipeline to generate job-specific
// cover letters without running the full orchestrator.
//
// Falls back to a template-based letter when AI is unavailable.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import logger from "../logger.js";
const FAST_MODEL = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
export async function generateQuickCoverLetter(input) {
    // Try AI generation first
    if (!AI_DISABLED && !MOCK_AI && process.env.ANTHROPIC_API_KEY) {
        try {
            const letter = await generateWithAI(input);
            return { coverLetter: letter, source: "ai" };
        }
        catch (err) {
            logger.warn({ err }, "[cover-letter] AI generation failed, using template fallback");
        }
    }
    // Template fallback
    return { coverLetter: generateTemplate(input), source: "template" };
}
async function generateWithAI(input) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    if (content.type !== "text")
        throw new Error("Unexpected response type");
    return content.text.trim();
}
function generateTemplate(input) {
    const skillsText = input.skills.slice(0, 6).join(", ");
    const experience = input.yearsExperience
        ? `With ${input.yearsExperience} years of experience`
        : "With my background";
    return `${experience} in ${skillsText}, I am well-positioned to contribute to the ${input.jobTitle} role at ${input.companyName}.

${input.headline ? `${input.headline}. ` : ""}My technical expertise and hands-on experience align closely with the requirements of this position. I bring a strong track record of delivering results and collaborating effectively with cross-functional teams.

${input.bio ? input.bio.slice(0, 300) : `I am passionate about leveraging my skills in ${skillsText} to drive impact at ${input.companyName}.`}

I would welcome the opportunity to discuss how my background and skills can contribute to your team's success.`;
}
//# sourceMappingURL=cover-letter.js.map