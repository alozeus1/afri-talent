// ─────────────────────────────────────────────────────────────────────────────
// Job URL Extraction API
//
// POST /api/job-extract/url — Accepts a URL, scrapes the page with cheerio,
//   extracts job posting text, and returns structured job data via AI.
//
// POST /api/job-extract/text — Accepts raw job text and returns structured data.
//
// Both endpoints feed into the orchestrator's job parsing pipeline so users
// don't have to manually paste raw text.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import * as cheerio from "cheerio";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";
import { Role } from "@prisma/client";
const router = Router();
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MOCK_AI = process.env.MOCK_AI === "1";
const FETCH_TIMEOUT_MS = parseInt(process.env.JOB_EXTRACT_TIMEOUT_MS || "15000", 10);
const urlSchema = z.object({
    url: z.string().url().max(2000),
});
const textSchema = z.object({
    text: z.string().min(50).max(30000),
});
// ── URL extraction ───────────────────────────────────────────────────────────
router.post("/url", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const parsed = urlSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid URL", details: parsed.error.issues });
        return;
    }
    const { url } = parsed.data;
    try {
        // Fetch the page
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let html;
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; AfriTalentBot/1.0; +https://afritalent.com)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
            });
            if (!response.ok) {
                res.status(422).json({ error: `Failed to fetch URL: HTTP ${response.status}` });
                return;
            }
            html = await response.text();
        }
        finally {
            clearTimeout(timeout);
        }
        // Extract job text from HTML
        const jobText = extractJobText(html, url);
        if (!jobText || jobText.length < 50) {
            res.status(422).json({
                error: "Could not extract sufficient job posting text from the URL",
                hint: "Try pasting the job description text directly using POST /api/job-extract/text",
            });
            return;
        }
        // Parse with AI or return raw text
        const structured = await parseJobText(jobText);
        res.json({
            success: true,
            sourceUrl: url,
            rawText: jobText.slice(0, 20000),
            rawTextLength: jobText.length,
            structured,
        });
    }
    catch (err) {
        if (err.name === "AbortError") {
            res.status(408).json({ error: "URL fetch timed out" });
            return;
        }
        logger.error({ url, err }, "[job-extract] URL extraction failed");
        res.status(500).json({ error: "Failed to extract job data from URL" });
    }
});
// ── Raw text extraction ──────────────────────────────────────────────────────
router.post("/text", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const parsed = textSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid text input", details: parsed.error.issues });
        return;
    }
    try {
        const structured = await parseJobText(parsed.data.text);
        res.json({
            success: true,
            rawTextLength: parsed.data.text.length,
            structured,
        });
    }
    catch (err) {
        logger.error({ err }, "[job-extract] text parsing failed");
        res.status(500).json({ error: "Failed to parse job text" });
    }
});
// ── HTML to job text extraction ──────────────────────────────────────────────
function extractJobText(html, url) {
    const $ = cheerio.load(html);
    // Remove noise elements
    $("script, style, nav, footer, header, iframe, noscript, svg, aside").remove();
    $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();
    $(".cookie-banner, .popup, .modal, .advertisement, .sidebar").remove();
    // Try structured job data first (JSON-LD)
    const jsonLdScripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
        try {
            const data = JSON.parse($(jsonLdScripts[i]).html() || "");
            if (data["@type"] === "JobPosting" || data?.["@graph"]?.some?.((g) => g["@type"] === "JobPosting")) {
                const posting = data["@type"] === "JobPosting" ? data : data["@graph"].find((g) => g["@type"] === "JobPosting");
                if (posting) {
                    return formatJobLd(posting);
                }
            }
        }
        catch {
            // malformed JSON-LD, continue
        }
    }
    // Try common job posting selectors
    const selectors = [
        // Generic job content selectors
        '[class*="job-description"]',
        '[class*="jobDescription"]',
        '[class*="job-detail"]',
        '[class*="jobDetail"]',
        '[class*="job-content"]',
        '[class*="job-posting"]',
        '[id*="job-description"]',
        '[id*="jobDescription"]',
        // Platform-specific
        ".posting-page",
        ".job-view-layout",
        '[data-testid="job-details"]',
        '[data-testid="jobDescription"]',
        // Greenhouse, Lever, Workday
        "#content",
        ".section-wrapper",
        ".posting",
        ".content",
        // Generic main content
        "article",
        "main",
        '[role="main"]',
    ];
    for (const selector of selectors) {
        const el = $(selector).first();
        if (el.length > 0) {
            const text = el.text().replace(/\s+/g, " ").trim();
            if (text.length > 100)
                return text;
        }
    }
    // Fallback: use body text
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    return bodyText.slice(0, 20000);
}
function formatJobLd(posting) {
    const parts = [];
    if (posting.title)
        parts.push(`Title: ${posting.title}`);
    if (posting.hiringOrganization) {
        const org = posting.hiringOrganization;
        if (org.name)
            parts.push(`Company: ${org.name}`);
    }
    if (posting.jobLocation) {
        const locs = Array.isArray(posting.jobLocation)
            ? posting.jobLocation
            : [posting.jobLocation];
        const locTexts = locs.map((l) => {
            const addr = l.address;
            return addr?.addressLocality || l.name || "Unknown";
        });
        parts.push(`Location: ${locTexts.join(", ")}`);
    }
    if (posting.employmentType)
        parts.push(`Type: ${posting.employmentType}`);
    if (posting.description) {
        // Strip HTML from description
        const $ = cheerio.load(posting.description);
        parts.push(`\nDescription:\n${$.text().trim()}`);
    }
    if (posting.qualifications)
        parts.push(`\nQualifications:\n${posting.qualifications}`);
    if (posting.responsibilities)
        parts.push(`\nResponsibilities:\n${posting.responsibilities}`);
    return parts.join("\n");
}
// ── AI job text parsing ──────────────────────────────────────────────────────
async function parseJobText(text) {
    if (AI_DISABLED || MOCK_AI || !process.env.ANTHROPIC_API_KEY) {
        return {
            source: "raw",
            note: "AI parsing unavailable — returning raw text for manual use or orchestrator input",
        };
    }
    try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
            model: process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            messages: [
                {
                    role: "user",
                    content: `Extract structured job data from this text. Return ONLY valid JSON:
{
  "title": "string or null",
  "company": "string or null",
  "location": "string or null",
  "type": "Full-time|Part-time|Contract|Freelance|Internship or null",
  "seniority": "Junior|Mid-level|Senior|Lead|Executive or null",
  "salaryMin": null,
  "salaryMax": null,
  "currency": null,
  "skills": ["required skills"],
  "visaSponsorship": "YES|NO|UNKNOWN",
  "relocationAssistance": false,
  "description": "first 2000 chars of cleaned description"
}

JOB TEXT:
${text.slice(0, 8000)}`,
                },
            ],
        });
        const content = response.content[0];
        if (content.type !== "text")
            throw new Error("Unexpected response type");
        const match = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = match ? match[1].trim() : content.text.trim();
        const parsed = JSON.parse(jsonStr);
        return { source: "ai", ...parsed };
    }
    catch (err) {
        logger.warn({ err }, "[job-extract] AI parsing failed, returning raw");
        return {
            source: "raw",
            note: "AI parsing failed — returning raw text for manual use",
        };
    }
}
export default router;
//# sourceMappingURL=job-extract.js.map