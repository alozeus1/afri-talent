// ─────────────────────────────────────────────────────────────────────────────
// Career Advisor AI Agent
//
// Analyses a candidate's resume and application history, then produces
// structured career advice: skill gaps, career paths, certifications,
// salary expectations, and a 90-day action plan.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../logger.js";
const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
export async function analyseCareer(input) {
    if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
        return buildTemplateAdvice(input);
    }
    try {
        return await analyseWithClaude(input);
    }
    catch (err) {
        logger.warn({ err }, "[career-advisor] AI analysis failed, using template fallback");
        return buildTemplateAdvice(input);
    }
}
async function analyseWithClaude(input) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = `You are a senior career coach specialising in African tech and professional markets with deep knowledge of compensation benchmarks, skill demand, and career progression patterns.

Analyse this candidate and provide structured career advice targeting the role of "${input.targetRole}".

CANDIDATE PROFILE:
- Years of Experience: ${input.yearsExperience}
- Current Skills: ${input.currentSkills.join(", ")}
- Recently Applied To: ${input.recentJobTitles.join(", ") || "No recent applications"}

RESUME:
${input.resumeText.slice(0, 3000)}

Return ONLY valid JSON (no markdown, no explanation) matching this schema exactly:
{
  "skillGaps": [
    {
      "skill": "skill name",
      "priority": "high|medium|low",
      "reason": "one sentence why this matters for ${input.targetRole}"
    }
  ],
  "careerPaths": [
    {
      "title": "role title",
      "timeline": "e.g. 6-12 months",
      "description": "1-2 sentence description of this path"
    }
  ],
  "certifications": [
    {
      "name": "certification name",
      "provider": "e.g. Google, AWS, Coursera",
      "rationale": "one sentence why this certification adds value"
    }
  ],
  "salaryRange": {
    "min": 0,
    "max": 0,
    "currency": "USD",
    "market": "e.g. Lagos, Nairobi, Remote-Global"
  },
  "actionPlan": [
    { "week": "Week 1-2", "action": "specific actionable step" },
    { "week": "Week 3-4", "action": "specific actionable step" },
    { "week": "Month 2", "action": "specific actionable step" },
    { "week": "Month 3", "action": "specific actionable step" }
  ],
  "summary": "2-3 sentence honest assessment of the candidate's position and biggest opportunity"
}

Rules:
- Limit skillGaps to 5 items max, sorted by priority
- Limit careerPaths to 3 items max
- Limit certifications to 3 items max
- Salary should reflect African market rates (primary) or remote-global rates if relevant
- Action plan should be specific and immediately actionable`;
    const response = await client.messages.create({
        model: QUALITY_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0];
    if (content.type !== "text")
        throw new Error("Unexpected Claude response type");
    const text = content.text.trim();
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1].trim() : text;
    return JSON.parse(jsonStr);
}
function buildTemplateAdvice(input) {
    return {
        skillGaps: [
            {
                skill: "Portfolio / GitHub projects",
                priority: "high",
                reason: `Employers hiring for ${input.targetRole} consistently look for demonstrated work.`,
            },
            {
                skill: "System Design",
                priority: "medium",
                reason: "Senior roles require architecture discussions during interviews.",
            },
        ],
        careerPaths: [
            {
                title: `Senior ${input.targetRole}`,
                timeline: "12-18 months",
                description: "Deepen expertise in your current stack and take ownership of larger features.",
            },
            {
                title: "Tech Lead",
                timeline: "2-3 years",
                description: "Lead a small team while remaining hands-on with architecture decisions.",
            },
        ],
        certifications: [
            {
                name: "AWS Certified Developer",
                provider: "Amazon Web Services",
                rationale: "Cloud skills are in high demand across African tech companies.",
            },
        ],
        salaryRange: {
            min: 800,
            max: 2500,
            currency: "USD",
            market: "Lagos / Remote-Africa",
        },
        actionPlan: [
            { week: "Week 1-2", action: "Update your LinkedIn profile and portfolio with your 3 best projects" },
            { week: "Week 3-4", action: "Apply to 5 target companies and request informational interviews" },
            { week: "Month 2", action: "Complete one online course or project to address your top skill gap" },
            { week: "Month 3", action: "Apply to 10 more roles and iterate on your resume based on feedback" },
        ],
        summary: `You have ${input.yearsExperience} years of experience and a solid skill set in ${input.currentSkills.slice(0, 3).join(", ")}. The biggest opportunity is strengthening your portfolio and closing specific skill gaps that ${input.targetRole} roles consistently require.`,
    };
}
//# sourceMappingURL=career-advisor.js.map