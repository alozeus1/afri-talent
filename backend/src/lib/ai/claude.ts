import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData } from "./types.js";

const FAST_MODEL = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
const QUALITY_MODEL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";

const MAX_TOKENS_FAST = 2048;
const MAX_TOKENS_QUALITY = 4096;

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  private async complete(model: string, maxTokens: number, prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type from Claude");
    return content.text;
  }

  private parseJSON<T>(text: string): T {
    // Extract JSON from markdown code blocks if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = match ? match[1].trim() : text.trim();
    return JSON.parse(jsonStr) as T;
  }

  async parseResume(resumeText: string): Promise<ParsedResume> {
    const prompt = `Parse the following resume and extract structured information.
Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "string or null",
  "skills": ["array of skill strings"],
  "experience": [{"company":"","title":"","startDate":"","endDate":"","description":""}],
  "education": [{"institution":"","degree":"","field":"","graduationYear":""}],
  "languages": ["array or empty"],
  "certifications": ["array or empty"]
}

Resume:
${resumeText}`;

    const response = await this.complete(FAST_MODEL, MAX_TOKENS_FAST, prompt);
    return this.parseJSON<ParsedResume>(response);
  }

  async tailorResume(resumeText: string, jobDescription: string): Promise<TailoredResume> {
    const prompt = `You are an expert resume coach. Tailor this candidate's resume for the specific job below.
Return ONLY valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence professional summary targeting this role",
  "skills": ["top 10 most relevant skills from their background"],
  "experienceHighlights": ["3-5 bullet points highlighting most relevant experience"],
  "coverLetter": "3-paragraph cover letter (200-300 words)"
}

CANDIDATE RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}`;

    const response = await this.complete(QUALITY_MODEL, MAX_TOKENS_QUALITY, prompt);
    return this.parseJSON<TailoredResume>(response);
  }

  async generateCoverLetter(
    resumeText: string,
    jobDescription: string,
    candidateName: string
  ): Promise<string> {
    const prompt = `Write a compelling cover letter for ${candidateName} applying to this job.
The letter should be 3 paragraphs, 200-300 words, professional but warm.
Emphasise how their background aligns with the specific requirements.
Return ONLY the cover letter text (no subject line, no JSON, no markdown).

CANDIDATE BACKGROUND:
${resumeText}

JOB DESCRIPTION:
${jobDescription}`;

    return this.complete(QUALITY_MODEL, MAX_TOKENS_QUALITY, prompt);
  }

  async extractJobData(rawJobText: string): Promise<ExtractedJobData> {
    const prompt = `Extract structured job data from this job posting.
Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "job title or null",
  "company": "company name or null",
  "location": "location or null",
  "type": "Full-time|Part-time|Contract|Freelance|Internship or null",
  "seniority": "Junior|Mid-level|Senior|Lead|Executive or null",
  "salaryMin": number or null,
  "salaryMax": number or null,
  "currency": "USD|EUR|GBP etc or null",
  "skills": ["required skill strings"],
  "visaSponsorship": "YES|NO|UNKNOWN",
  "relocationAssistance": true or false,
  "eligibleCountries": ["ISO country codes or empty array"],
  "description": "cleaned job description (max 2000 chars)"
}

JOB POSTING:
${rawJobText}`;

    const response = await this.complete(FAST_MODEL, MAX_TOKENS_FAST, prompt);
    return this.parseJSON<ExtractedJobData>(response);
  }
}
