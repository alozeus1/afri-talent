// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — specialist sub-agents
//
// Each agent wraps a Claude call with a strict system prompt, extracts JSON,
// and enforces the no-fabrication rule.  All agents are pure functions that
// return typed schema objects plus a token estimate.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
// ── Shared Claude client (reuse process-level singleton) ─────────────────────
const FAST = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
const QUAL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
let _client = null;
function getClient() {
    if (!_client) {
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("ANTHROPIC_API_KEY not set — AI agents are unavailable");
        }
        _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return _client;
}
// ── Token estimate helper (≈4 chars per token) ───────────────────────────────
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
// ── JSON extraction helper ────────────────────────────────────────────────────
function extractJSON(text) {
    // Strip markdown code fences if Claude wraps output
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1].trim() : text.trim();
    return JSON.parse(raw);
}
async function agentCall(model, maxTokens, systemPrompt, userContent) {
    const client = getClient();
    const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
    });
    const content = response.content[0];
    if (content.type !== "text")
        throw new Error("Unexpected non-text response from Claude");
    const data = extractJSON(content.text);
    // Use actual usage if available, else estimate
    const token_estimate = (response.usage?.input_tokens ?? estimateTokens(systemPrompt + userContent)) +
        (response.usage?.output_tokens ?? estimateTokens(content.text));
    return { data, token_estimate };
}
// ─────────────────────────────────────────────────────────────────────────────
// ResumeParserAgent
// ─────────────────────────────────────────────────────────────────────────────
const RESUME_PARSER_SYSTEM = `You are ResumeParserAgent. Your only job is to extract structured data from a resume.

NON-NEGOTIABLE:
- Extract only what is explicitly written. Never infer, add, or fabricate.
- If a field is not present, use null or an empty array.
- Do NOT infer work_auth_status from nationality or location.
- Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "name": string|null,
  "email": string|null,
  "phone": string|null,
  "location": string|null,
  "headline": string|null,
  "summary": string|null,
  "years_of_experience": number|null,
  "skills": string[],
  "experience": [
    {
      "company": string,
      "title": string,
      "start_date": string|null,
      "end_date": string|null,
      "description": string|null,
      "metrics": string[],
      "technologies": string[]
    }
  ],
  "education": [
    {
      "institution": string,
      "degree": string|null,
      "field": string|null,
      "graduation_year": string|null
    }
  ],
  "languages": string[],
  "certifications": string[],
  "work_auth_status": string|null
}`;
export async function ResumeParserAgent(resumeText) {
    return agentCall(FAST, 2048, RESUME_PARSER_SYSTEM, `RESUME TEXT:\n${resumeText}`);
}
// ─────────────────────────────────────────────────────────────────────────────
// JobParserAgent
// ─────────────────────────────────────────────────────────────────────────────
const JOB_PARSER_SYSTEM = `You are JobParserAgent. Your only job is to extract structured data from a job posting.

NON-NEGOTIABLE:
- Extract only what is explicitly stated. Do not infer or fabricate.
- Separate must_have_skills (words like "required", "must", "essential") from
  nice_to_have_skills ("preferred", "nice to have", "bonus", "plus").
- If salary is not stated, use null.
- eligible_countries: use ISO-3166 alpha-2 codes only. Empty array if not specified.
- Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "title": string|null,
  "company": string|null,
  "location": string|null,
  "type": "Full-time"|"Part-time"|"Contract"|"Freelance"|"Internship"|null,
  "seniority": "Junior"|"Mid-level"|"Senior"|"Lead"|"Executive"|null,
  "salary_min": number|null,
  "salary_max": number|null,
  "currency": string|null,
  "must_have_skills": string[],
  "nice_to_have_skills": string[],
  "visa_sponsorship": "YES"|"NO"|"UNKNOWN",
  "relocation_assistance": boolean,
  "eligible_countries": string[],
  "description": string|null,
  "requirements": string[],
  "responsibilities": string[]
}`;
export async function JobParserAgent(rawJobText) {
    return agentCall(FAST, 2048, JOB_PARSER_SYSTEM, `JOB POSTING:\n${rawJobText}`);
}
// ─────────────────────────────────────────────────────────────────────────────
// MatchScorerAgent
// ─────────────────────────────────────────────────────────────────────────────
const MATCH_SCORER_SYSTEM = `You are MatchScorerAgent. Score the fit between a candidate's resume and a job.

SCORING RULES:
- score (0–100): weighted composite. Weights: skills 50%, seniority 20%, location/auth 20%, other 10%.
- must_have_coverage_pct: % of must_have_skills the candidate satisfies (0–100).
- nice_to_have_coverage_pct: % of nice_to_have_skills the candidate satisfies (0–100).
- location_match: true if candidate location overlaps job location OR job is remote.
- work_auth_ok: true if candidate's work_auth_status is compatible with the job's eligible countries OR unknown.
- visa_ok: true if visa_sponsorship = "YES" OR candidate doesn't need it.
- seniority_match: "match" | "over" | "under" | "unknown".
- recommendation: "apply" if score≥70, "stretch" if 55–69, "skip" if <55.
- explanation: 2–3 sentences. Be specific. No fabrication.

Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "score": number,
  "must_have_coverage_pct": number,
  "nice_to_have_coverage_pct": number,
  "matched_skills": string[],
  "missing_must_haves": string[],
  "missing_nice_to_haves": string[],
  "location_match": boolean,
  "work_auth_ok": boolean,
  "visa_ok": boolean,
  "seniority_match": "match"|"over"|"under"|"unknown",
  "recommendation": "apply"|"stretch"|"skip",
  "explanation": string
}`;
export async function MatchScorerAgent(resume, job, candidateProfile) {
    const userContent = [
        "CANDIDATE RESUME JSON:",
        JSON.stringify(resume, null, 2),
        "\nJOB JSON:",
        JSON.stringify(job, null, 2),
        candidateProfile
            ? `\nCANDIDATE PROFILE HINTS:\n${JSON.stringify(candidateProfile, null, 2)}`
            : "",
    ].join("\n");
    return agentCall(FAST, 1024, MATCH_SCORER_SYSTEM, userContent);
}
// ─────────────────────────────────────────────────────────────────────────────
// ResumeTailorAgent
// ─────────────────────────────────────────────────────────────────────────────
const RESUME_TAILOR_SYSTEM = `You are ResumeTailorAgent. Rewrite the candidate's resume to target a specific job.

NON-NEGOTIABLE:
- Only use skills, experience, and facts already present in the resume.
- Never add employers, titles, dates, metrics, tools, or certifications not in the original.
- If a metric would strengthen a bullet but is missing, include it as a placeholder like
  "[X%]" or "[N projects]" and add it to the warnings array with "requires_user_confirmation".
- Keep ats_keywords strictly to terms found in the job description.
- Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "summary": string,
  "skills": string[],
  "experience": [
    {
      "company": string,
      "title": string,
      "period": string,
      "bullets": string[]
    }
  ],
  "ats_keywords": string[],
  "warnings": string[]
}`;
export async function ResumeTailorAgent(resume, job) {
    const userContent = [
        "CANDIDATE RESUME JSON:",
        JSON.stringify(resume, null, 2),
        "\nTARGET JOB JSON:",
        JSON.stringify(job, null, 2),
    ].join("\n");
    return agentCall(QUAL, 4096, RESUME_TAILOR_SYSTEM, userContent);
}
// ─────────────────────────────────────────────────────────────────────────────
// CoverLetterAgent
// ─────────────────────────────────────────────────────────────────────────────
const COVER_LETTER_SYSTEM = `You are CoverLetterAgent. Write a compelling, truthful cover letter.

NON-NEGOTIABLE:
- Use only facts from the resume. No fabrication of projects, metrics, or roles.
- 3 paragraphs: (1) hook + role fit, (2) key evidence from experience, (3) motivation + call-to-action.
- 200–300 words in the body.
- Tone: professional but warm.
- Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "subject_line": string,
  "salutation": string,
  "body": string,
  "closing": string,
  "tone": "professional"|"warm"|"direct",
  "word_count": number
}`;
export async function CoverLetterAgent(resume, job, tailoredResume) {
    const userContent = [
        "CANDIDATE RESUME JSON:",
        JSON.stringify(resume, null, 2),
        "\nTARGET JOB JSON:",
        JSON.stringify(job, null, 2),
        "\nTAILORED RESUME (context):",
        JSON.stringify(tailoredResume, null, 2),
    ].join("\n");
    return agentCall(QUAL, 2048, COVER_LETTER_SYSTEM, userContent);
}
// ─────────────────────────────────────────────────────────────────────────────
// TruthConsistencyGuardAgent
// ─────────────────────────────────────────────────────────────────────────────
const GUARD_SYSTEM = `You are TruthConsistencyGuardAgent. Audit a tailored resume and cover letter for fabrications.

YOUR JOB:
- Compare the tailored resume and cover letter against the original resume.
- Flag any employer, title, date, metric, tool, certification, or claim that does NOT appear in the original.
- Flag exaggerations (e.g. "led a team of 50" when original says "worked in a team").
- Items marked "[X%]" or "[N...]" are placeholders — add them to requires_user_confirmation, not issues.
- Verdict: "PASS" if no high/medium issues found; "FAIL" otherwise.
- confidence: your certainty in the verdict (0.0–1.0).

Return ONLY valid JSON — no prose, no markdown fences.

Output this exact schema:
{
  "verdict": "PASS"|"FAIL",
  "issues": [
    {
      "type": "fabrication"|"inconsistency"|"exaggeration",
      "field": string,
      "original_value": string,
      "fabricated_value": string,
      "severity": "high"|"medium"|"low"
    }
  ],
  "requires_user_confirmation": string[],
  "confidence": number
}`;
export async function TruthConsistencyGuardAgent(originalResume, tailoredResume, coverLetter) {
    const userContent = [
        "ORIGINAL RESUME JSON:",
        JSON.stringify(originalResume, null, 2),
        "\nTAILORED RESUME JSON:",
        JSON.stringify(tailoredResume, null, 2),
        "\nCOVER LETTER JSON:",
        JSON.stringify(coverLetter, null, 2),
    ].join("\n");
    return agentCall(QUAL, 2048, GUARD_SYSTEM, userContent);
}
//# sourceMappingURL=agents.js.map