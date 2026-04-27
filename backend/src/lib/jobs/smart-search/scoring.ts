import type { NormalizedJob, ScoreBreakdown } from "./normalized-job.js";
import { normalizeKeyword } from "./keywords.js";

const SUSPICIOUS_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me"];
const PAYMENT_PATTERNS = [/pay.*fee/i, /registration fee/i, /processing fee/i, /training fee/i, /send money/i];
const WHATSAPP_ONLY = /whats\s?app only|apply.*whats\s?app|contact.*whats\s?app/i;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasValidUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function scoreScamRisk(job: NormalizedJob): ScoreBreakdown {
  const signals: string[] = [];
  let score = 0;
  const text = `${job.title}\n${job.description}\n${job.applyUrl ?? ""}`;
  const emailMatches = text.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi) ?? [];
  if (emailMatches.some((email) => SUSPICIOUS_EMAIL_DOMAINS.some((domain) => email.toLowerCase().endsWith(`@${domain}`)))) {
    score += 18;
    signals.push("suspicious_email_domain");
  }
  if (!hasValidUrl(job.applyUrl)) {
    score += 20;
    signals.push("no_valid_apply_url");
  }
  if (!hasValidUrl(job.sourceUrl) && !hasValidUrl(job.applyUrl)) {
    score += 12;
    signals.push("missing_company_website");
  }
  if (job.salaryMax && job.salaryMax > 900_000) {
    score += 14;
    signals.push("unrealistic_salary");
  }
  if (job.description.trim().length < 160) {
    score += 16;
    signals.push("poor_job_description");
  }
  if (PAYMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    score += 30;
    signals.push("requests_payment");
  }
  if (WHATSAPP_ONLY.test(text)) {
    score += 25;
    signals.push("whatsapp_only_communication");
  }
  if (job.duplicateOfExternalId) {
    score += 8;
    signals.push("duplicate_spam_pattern");
  }

  return { score: clamp(score), signals };
}

export function scoreQuality(job: NormalizedJob, scamRisk = scoreScamRisk(job).score): ScoreBreakdown {
  const signals: string[] = [];
  let score = 50;
  if (job.description.length >= 500) {
    score += 16;
    signals.push("complete_description");
  }
  if (hasValidUrl(job.applyUrl)) {
    score += 12;
    signals.push("valid_apply_url");
  }
  if (job.location && job.location !== "Unknown") {
    score += 8;
    signals.push("clear_location");
  }
  if (job.salaryMin || job.salaryMax) {
    score += 8;
    signals.push("salary_transparent");
  }
  if (job.skills.length > 0) {
    score += 6;
    signals.push("skills_detected");
  }
  score -= Math.round(scamRisk * 0.45);

  return { score: clamp(score), signals };
}

export interface RelevanceContext {
  query?: string | null;
  expandedKeywords?: string[];
  skills?: string[];
  location?: string | null;
  remoteOnly?: boolean;
  salaryMin?: number | null;
  companyQuality?: number;
}

export function scoreRelevance(job: NormalizedJob, context: RelevanceContext = {}): ScoreBreakdown {
  const queryTerms = Array.from(new Set([
    ...(context.query ? [context.query] : []),
    ...(context.expandedKeywords ?? []),
  ].map(normalizeKeyword).filter(Boolean)));
  const title = normalizeKeyword(job.title);
  const description = normalizeKeyword(job.description);
  const skills = new Set(job.skills.map(normalizeKeyword));
  const signals: string[] = [];
  const components: Record<string, number> = {};

  const titleMatches = queryTerms.filter((term) => title.includes(term)).length;
  const descriptionMatches = queryTerms.filter((term) => description.includes(term)).length;
  components.titleMatch = queryTerms.length ? (titleMatches / queryTerms.length) * 30 : 18;
  components.descriptionMatch = queryTerms.length ? Math.min(16, descriptionMatches * 4) : 8;
  if (titleMatches > 0) signals.push("title_match");

  const wantedSkills = (context.skills ?? []).map(normalizeKeyword).filter(Boolean);
  const skillMatches = wantedSkills.filter((skill) => skills.has(skill) || description.includes(skill)).length;
  components.skillsMatch = wantedSkills.length ? (skillMatches / wantedSkills.length) * 18 : 8;
  if (skillMatches > 0) signals.push("skills_match");

  const location = normalizeKeyword(job.location);
  const preferredLocation = normalizeKeyword(context.location ?? "");
  components.locationFit = preferredLocation && location.includes(preferredLocation) ? 10 : 5;
  if (components.locationFit >= 10) signals.push("location_fit");

  components.remoteFit = context.remoteOnly ? (job.remoteType === "REMOTE" ? 10 : 0) : 6;
  if (job.remoteType === "REMOTE") signals.push("remote_fit");

  const ageDays = job.postedAt ? Math.max(0, (Date.now() - job.postedAt.getTime()) / 86_400_000) : 45;
  components.freshness = ageDays <= 7 ? 10 : ageDays <= 30 ? 7 : 3;

  components.companyQuality = context.companyQuality ?? 6;
  components.salaryFit = context.salaryMin && job.salaryMax ? (job.salaryMax >= context.salaryMin ? 8 : 0) : 4;
  components.scamPenalty = -Math.round(job.scamRiskScore * 0.18);

  return {
    score: clamp(Object.values(components).reduce((sum, value) => sum + value, 0)),
    signals,
    components,
  };
}

export function scoreFinalJob(job: NormalizedJob, relevance = scoreRelevance(job).score): ScoreBreakdown {
  const components = {
    relevance: relevance * 0.5,
    quality: job.qualityScore * 0.3,
    scamRisk: -job.scamRiskScore * 0.2,
    salary: job.salaryMin || job.salaryMax ? 6 : 0,
  };
  return {
    score: clamp(Object.values(components).reduce((sum, value) => sum + value, 0)),
    signals: ["weighted_relevance_quality_risk"],
    components,
  };
}
