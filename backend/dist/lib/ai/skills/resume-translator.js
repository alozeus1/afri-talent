// Resume Translator — translates resume content to target language
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";
const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
export const LANGUAGE_NAMES = {
    fr: "French",
    pt: "Portuguese",
    ar: "Arabic",
    sw: "Swahili",
    es: "Spanish",
};
export async function translateResume(input) {
    if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
        return {
            translatedText: input.resumeText,
            targetLanguage: input.targetLanguage,
            languageName: LANGUAGE_NAMES[input.targetLanguage],
            source: "template",
        };
    }
    try {
        return await generateWithClaude(input);
    }
    catch (err) {
        logger.warn({ err }, "[resume-translator] AI failed");
        return {
            translatedText: input.resumeText,
            targetLanguage: input.targetLanguage,
            languageName: LANGUAGE_NAMES[input.targetLanguage],
            source: "template",
        };
    }
}
async function generateWithClaude(input) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const langName = LANGUAGE_NAMES[input.targetLanguage];
    const prompt = `Translate the following professional resume into ${langName}.
Preserve all formatting, section headers, bullet points, and professional terminology.
Keep technical terms, company names, job titles, and dates in their original form.
Maintain the same professional tone throughout.

RESUME:
${input.resumeText.slice(0, 6000)}

Return ONLY the translated resume text, no explanation or wrapping.`;
    const response = await client.messages.create({
        model: QUALITY_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0];
    if (content.type !== "text")
        throw new Error("Unexpected Claude response type");
    return {
        translatedText: content.text.trim(),
        targetLanguage: input.targetLanguage,
        languageName: langName,
        source: "ai",
    };
}
//# sourceMappingURL=resume-translator.js.map