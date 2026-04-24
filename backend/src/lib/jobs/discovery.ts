import crypto from "crypto";
import { EmployerVerificationLevel, Prisma, TrustRiskLevel } from "@prisma/client";

const STALE_THRESHOLD_DAYS = parseInt(process.env.JOB_STALE_DAYS || "30", 10);
const GENERIC_LOCATION_PATTERNS = ["tbd", "various", "multiple", "to be determined"];
const TRUSTED_APPLY_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "jobvite.com",
  "ashbyhq.com",
  "myworkdaysite.com",
  "smartrecruiters.com",
];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "be",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export interface EmployerTrustLike {
  verificationLevel?: EmployerVerificationLevel | string | null;
  authenticityScore?: number | null;
  riskScore?: number | null;
  riskLevel?: TrustRiskLevel | string | null;
}

export interface JobSourceLineageRecord {
  source: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  company: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JobDocumentLike {
  id?: string;
  title: string;
  description: string;
  location: string;
  type?: string | null;
  seniority?: string | null;
  tags?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  visaSponsorship?: string | null;
  relocationAssistance?: boolean | null;
  eligibleCountries?: string[];
  sourceUrl?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  jobSource?: string | null;
  applicationUrl?: string | null;
  employerId?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  sourceFirstSeenAt?: Date | string | null;
  sourceLastSeenAt?: Date | string | null;
  riskScore?: number | null;
  riskLevel?: TrustRiskLevel | string | null;
  trustFlags?: unknown;
  sourceLineage?: unknown;
  employer?: {
    companyName?: string | null;
    createdAt?: Date | string | null;
    trustProfile?: EmployerTrustLike | null;
  } | null;
}

export interface CandidatePreferenceContext {
  query?: string;
  keywords?: string[];
  locations?: string[];
  jobTypes?: string[];
  seniorities?: string[];
  skills?: string[];
  targetRoles?: string[];
  targetCountries?: string[];
  remoteOnly?: boolean;
  requiresVisaSponsorship?: boolean;
  prefersRelocationSupport?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

export interface JobFreshnessEvaluation {
  score: number;
  label: "FRESH" | "RECENT" | "ACTIVE" | "AGING" | "STALE" | "EXPIRED";
  isStale: boolean;
  ageDays: number;
  staleAt: Date | null;
  referenceAt: Date | null;
}

export interface JobQualitySignals {
  verifiedEmployer: boolean;
  descriptionComplete: boolean;
  compensationTransparent: boolean;
  validApplicationPath: boolean;
  locationClear: boolean;
  mobilityClear: boolean;
  lowScamRisk: boolean;
  metadataRich: boolean;
}

export interface JobQualityEvaluation {
  score: number;
  label: "TRUSTED" | "SOLID" | "REVIEW" | "THIN";
  signals: JobQualitySignals;
}

export interface PreferenceMatchEvaluation {
  score: number;
  matchedPreferences: string[];
}

export interface JobDiscoverySummary {
  qualityScore: number;
  freshnessScore: number;
  applicationLikelihoodScore: number;
  trustedJob: boolean;
  stale: boolean;
  freshnessLabel: JobFreshnessEvaluation["label"];
  qualityLabel: JobQualityEvaluation["label"];
  salaryTransparent: boolean;
  verifiedEmployer: boolean;
  visaClear: boolean;
  relocationClear: boolean;
  validApplicationPath: boolean;
  verifiedApplyPath: boolean;
  trustedSource: boolean;
  applyPathType: "DIRECT" | "ATS" | "BOARD" | "UNKNOWN";
  sourceVerification: "DIRECT_EMPLOYER" | "ATS_PRIMARY" | "AGGREGATOR_VERIFIED" | "SCRAPED" | "UNKNOWN";
  deliveryModel: "ON_PLATFORM" | "EXTERNAL_ATS" | "EXTERNAL_BOARD" | "UNKNOWN";
  sourceCount: number;
  sourceNames: string[];
  lastSeenAt: string | null;
}

export interface JobRankingExplanation {
  score: number;
  summary: string;
  reasons: string[];
  matchedPreferences: string[];
  components: {
    relevance: number;
    freshness: number;
    applicationLikelihood: number;
    employerTrust: number;
    salaryTransparency: number;
    mobilityRelevance: number;
    candidatePreferenceMatch: number;
    quality: number;
  };
}

export interface RankedJobResult<TJob> {
  job: TJob;
  score: number;
  explanation: JobRankingExplanation;
  discovery: JobDiscoverySummary;
  fingerprint: string;
  sourceLineage: JobSourceLineageRecord[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function toDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
    ),
  );
}

function isRemoteLocation(location: string): boolean {
  return normalizeText(location).includes("remote");
}

function companyName(job: JobDocumentLike): string {
  return job.employer?.companyName || job.sourceName || "unknown";
}

function canonicalUrl(value?: string | null): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return normalizeText(value);
  }
}

function riskLevelValue(level?: TrustRiskLevel | string | null): TrustRiskLevel {
  if (level === TrustRiskLevel.MEDIUM || level === TrustRiskLevel.HIGH || level === TrustRiskLevel.CRITICAL) {
    return level;
  }
  return TrustRiskLevel.LOW;
}

function verificationValue(level?: EmployerVerificationLevel | string | null): EmployerVerificationLevel {
  if (
    level === EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED ||
    level === EmployerVerificationLevel.BUSINESS_DOC_VERIFIED ||
    level === EmployerVerificationLevel.MANUAL_REVIEW_APPROVED ||
    level === EmployerVerificationLevel.PREMIUM_TRUSTED
  ) {
    return level;
  }
  return EmployerVerificationLevel.UNVERIFIED;
}

function buildLineageEntry(job: JobDocumentLike, now = new Date()): JobSourceLineageRecord {
  const firstSeenAt = toDate(job.sourceFirstSeenAt) ?? toDate(job.publishedAt) ?? now;
  const lastSeenAt = toDate(job.sourceLastSeenAt) ?? toDate(job.lastCheckedAt) ?? toDate(job.updatedAt) ?? now;

  return {
    source: job.jobSource ?? job.sourceName ?? null,
    sourceId: job.sourceId ?? null,
    sourceUrl: job.sourceUrl ?? null,
    applicationUrl: job.applicationUrl ?? null,
    company: companyName(job),
    firstSeenAt: firstSeenAt.toISOString(),
    lastSeenAt: lastSeenAt.toISOString(),
  };
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(keyFn(item), item);
  }
  return Array.from(seen.values());
}

export function normalizeSourceLineage(lineage: unknown): JobSourceLineageRecord[] {
  if (!Array.isArray(lineage)) {
    return [];
  }

  const normalized = lineage.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const firstSeenAt = toDate(typeof candidate.firstSeenAt === "string" ? candidate.firstSeenAt : null);
    const lastSeenAt = toDate(typeof candidate.lastSeenAt === "string" ? candidate.lastSeenAt : null);

    if (!firstSeenAt || !lastSeenAt) {
      return [];
    }

    return [{
      source: typeof candidate.source === "string" ? candidate.source : null,
      sourceId: typeof candidate.sourceId === "string" ? candidate.sourceId : null,
      sourceUrl: typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : null,
      applicationUrl: typeof candidate.applicationUrl === "string" ? candidate.applicationUrl : null,
      company: typeof candidate.company === "string" ? candidate.company : null,
      firstSeenAt: firstSeenAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
    }];
  });

  return uniqueBy(normalized, (item) => item.sourceId || item.sourceUrl || `${item.source}:${item.company}`);
}

export function mergeSourceLineage(
  existingLineage: unknown,
  incomingJobs: JobDocumentLike[],
  now = new Date(),
): JobSourceLineageRecord[] {
  const merged = [...normalizeSourceLineage(existingLineage)];

  for (const job of incomingJobs) {
    const entry = buildLineageEntry(job, now);
    const key = entry.sourceId || entry.sourceUrl || `${entry.source}:${entry.company}`;
    const existing = merged.find(
      (item) => (item.sourceId || item.sourceUrl || `${item.source}:${item.company}`) === key,
    );

    if (!existing) {
      merged.push(entry);
      continue;
    }

    existing.firstSeenAt =
      new Date(existing.firstSeenAt).getTime() <= new Date(entry.firstSeenAt).getTime()
        ? existing.firstSeenAt
        : entry.firstSeenAt;
    existing.lastSeenAt =
      new Date(existing.lastSeenAt).getTime() >= new Date(entry.lastSeenAt).getTime()
        ? existing.lastSeenAt
        : entry.lastSeenAt;
    existing.applicationUrl = existing.applicationUrl ?? entry.applicationUrl;
    existing.sourceUrl = existing.sourceUrl ?? entry.sourceUrl;
    existing.company = existing.company ?? entry.company;
    existing.source = existing.source ?? entry.source;
  }

  return merged.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

export function buildSourceFingerprint(job: JobDocumentLike): string {
  const normalizedTitle = normalizeText(job.title);
  const normalizedCompany = normalizeText(companyName(job));
  const normalizedLocation = normalizeText(job.location);
  const urlSeed = canonicalUrl(job.sourceUrl);
  const seed = normalizedCompany && normalizedCompany !== "unknown"
    ? [normalizedTitle, normalizedCompany, normalizedLocation].join("|")
    : [normalizedTitle, normalizedCompany, normalizedLocation, urlSeed].join("|");

  return crypto.createHash("sha1").update(seed).digest("hex");
}

function employerTrustScore(job: JobDocumentLike): number {
  const trustProfile = job.employer?.trustProfile;
  if (!trustProfile) {
    return 38;
  }

  const verification = verificationValue(trustProfile.verificationLevel);
  const verificationScore = ({
    [EmployerVerificationLevel.UNVERIFIED]: 35,
    [EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED]: 55,
    [EmployerVerificationLevel.BUSINESS_DOC_VERIFIED]: 74,
    [EmployerVerificationLevel.MANUAL_REVIEW_APPROVED]: 88,
    [EmployerVerificationLevel.PREMIUM_TRUSTED]: 96,
  } as const)[verification];

  const authenticity = clamp(trustProfile.authenticityScore ?? 0);
  const riskPenalty = clamp((trustProfile.riskScore ?? 0) * 0.8, 0, 40);
  return clamp(Math.round(verificationScore * 0.6 + authenticity * 0.4 - riskPenalty * 0.35));
}

function salaryTransparencyScore(job: JobDocumentLike): number {
  const hasMin = typeof job.salaryMin === "number";
  const hasMax = typeof job.salaryMax === "number";
  const hasCurrency = Boolean(job.currency);

  if (hasMin && hasMax && hasCurrency) return 100;
  if ((hasMin || hasMax) && hasCurrency) return 65;
  return 0;
}

function hasValidExternalUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function hostnameFromUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesTrustedHost(value?: string | null): boolean {
  const hostname = hostnameFromUrl(value);
  if (!hostname) return false;

  return TRUSTED_APPLY_HOSTS.some(
    (trustedHost) => hostname === trustedHost || hostname.endsWith(`.${trustedHost}`),
  );
}

function detectApplyPathType(job: JobDocumentLike): "DIRECT" | "ATS" | "BOARD" | "UNKNOWN" {
  if (job.jobSource === "EMPLOYER_POSTED" || (job.employerId && !job.applicationUrl && !job.sourceUrl)) {
    return "DIRECT";
  }

  if (matchesTrustedHost(job.applicationUrl) || matchesTrustedHost(job.sourceUrl)) {
    return "ATS";
  }

  if (hasValidExternalUrl(job.applicationUrl) || hasValidExternalUrl(job.sourceUrl)) {
    return "BOARD";
  }

  return "UNKNOWN";
}

function detectSourceVerification(
  job: JobDocumentLike,
  sourceLineage: JobSourceLineageRecord[],
): "DIRECT_EMPLOYER" | "ATS_PRIMARY" | "AGGREGATOR_VERIFIED" | "SCRAPED" | "UNKNOWN" {
  const applyPathType = detectApplyPathType(job);
  if (applyPathType === "DIRECT") return "DIRECT_EMPLOYER";
  if (applyPathType === "ATS") return "ATS_PRIMARY";
  if (sourceLineage.length > 1) return "AGGREGATOR_VERIFIED";
  if (hasValidExternalUrl(job.sourceUrl) || hasValidExternalUrl(job.applicationUrl)) return "SCRAPED";
  return "UNKNOWN";
}

function detectDeliveryModel(job: JobDocumentLike): "ON_PLATFORM" | "EXTERNAL_ATS" | "EXTERNAL_BOARD" | "UNKNOWN" {
  const applyPathType = detectApplyPathType(job);
  if (job.jobSource === "EMPLOYER_POSTED" || applyPathType === "DIRECT") {
    return "ON_PLATFORM";
  }
  if (applyPathType === "ATS") {
    return "EXTERNAL_ATS";
  }
  if (applyPathType === "BOARD") {
    return "EXTERNAL_BOARD";
  }
  return "UNKNOWN";
}

export function evaluateFreshness(job: JobDocumentLike, now = new Date()): JobFreshnessEvaluation {
  const referenceAt =
    toDate(job.sourceLastSeenAt) ??
    toDate(job.lastCheckedAt) ??
    toDate(job.publishedAt) ??
    toDate(job.updatedAt) ??
    toDate(job.createdAt);
  const expiresAt = toDate(job.expiresAt);

  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return {
      score: 0,
      label: "EXPIRED",
      isStale: true,
      ageDays: referenceAt ? Math.max(0, Math.floor((now.getTime() - referenceAt.getTime()) / 86400000)) : STALE_THRESHOLD_DAYS,
      staleAt: expiresAt,
      referenceAt,
    };
  }

  if (!referenceAt) {
    return {
      score: 35,
      label: "AGING",
      isStale: false,
      ageDays: STALE_THRESHOLD_DAYS - 1,
      staleAt: null,
      referenceAt: null,
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - referenceAt.getTime()) / 86400000));
  const staleAt = new Date(referenceAt.getTime() + STALE_THRESHOLD_DAYS * 86400000);
  const isStale = staleAt.getTime() <= now.getTime();

  if (ageDays <= 3) {
    return { score: 100, label: "FRESH", isStale, ageDays, staleAt, referenceAt };
  }
  if (ageDays <= 7) {
    return { score: 88, label: "RECENT", isStale, ageDays, staleAt, referenceAt };
  }
  if (ageDays <= 14) {
    return { score: 74, label: "ACTIVE", isStale, ageDays, staleAt, referenceAt };
  }
  if (ageDays <= 21) {
    return { score: 58, label: "AGING", isStale, ageDays, staleAt, referenceAt };
  }
  if (ageDays <= STALE_THRESHOLD_DAYS) {
    return { score: 40, label: "AGING", isStale, ageDays, staleAt, referenceAt };
  }
  return { score: 18, label: "STALE", isStale: true, ageDays, staleAt, referenceAt };
}

export function evaluateJobQuality(job: JobDocumentLike): JobQualityEvaluation {
  const normalizedDescription = normalizeText(job.description);
  const riskLevel = riskLevelValue(job.riskLevel);
  const applyPathType = detectApplyPathType(job);
  const verifiedApplyPath = applyPathType === "DIRECT" || applyPathType === "ATS";
  const signals: JobQualitySignals = {
    verifiedEmployer: employerTrustScore(job) >= 70,
    descriptionComplete: normalizedDescription.length >= 280 || normalizedDescription.split(" ").length >= 80,
    compensationTransparent: salaryTransparencyScore(job) >= 65,
    validApplicationPath: Boolean(job.applicationUrl || job.employer?.companyName) && (
      hasValidExternalUrl(job.applicationUrl) ||
      hasValidExternalUrl(job.sourceUrl) ||
      Boolean(job.employer?.companyName)
    ),
    locationClear:
      Boolean(normalizeText(job.location)) &&
      !GENERIC_LOCATION_PATTERNS.some((pattern) => normalizeText(job.location).includes(pattern)),
    mobilityClear:
      job.visaSponsorship !== "UNKNOWN" ||
      Boolean(job.relocationAssistance) ||
      Boolean(job.eligibleCountries && job.eligibleCountries.length > 0),
    lowScamRisk:
      (job.riskScore ?? 0) < 45 &&
      riskLevel !== TrustRiskLevel.HIGH &&
      riskLevel !== TrustRiskLevel.CRITICAL,
    metadataRich: Boolean(job.seniority) || Boolean(job.tags && job.tags.length >= 3),
  };

  const score =
    (signals.verifiedEmployer ? 20 : 0) +
    (signals.descriptionComplete ? 20 : 0) +
    (signals.compensationTransparent ? 14 : 0) +
    (signals.validApplicationPath ? 10 : 0) +
    (verifiedApplyPath ? 4 : 0) +
    (signals.locationClear ? 10 : 0) +
    (signals.mobilityClear ? 8 : 0) +
    (signals.lowScamRisk ? 10 : 0) +
    (signals.metadataRich ? 4 : 0);

  let label: JobQualityEvaluation["label"] = "THIN";
  if (score >= 82) label = "TRUSTED";
  else if (score >= 64) label = "SOLID";
  else if (score >= 44) label = "REVIEW";

  return { score, label, signals };
}

export function evaluateCandidatePreferenceMatch(
  job: JobDocumentLike,
  context?: CandidatePreferenceContext,
): PreferenceMatchEvaluation {
  if (!context) {
    return { score: 50, matchedPreferences: [] };
  }

  const matchedPreferences = new Set<string>();
  const titleTokens = tokenize(job.title);
  const descriptionTokens = tokenize(job.description);
  const jobTags = (job.tags || []).map((tag) => normalizeText(tag));
  const locationText = normalizeText(job.location);
  const countryTokens = (job.eligibleCountries || []).map((country) => country.toLowerCase());

  let score = 0;

  if (context.skills && context.skills.length > 0) {
    const normalizedSkills = context.skills.map((skill) => normalizeText(skill));
    const skillMatches = normalizedSkills.filter((skill) => jobTags.includes(skill) || descriptionTokens.includes(skill));
    score += Math.round((skillMatches.length / normalizedSkills.length) * 35);
    skillMatches.forEach((match) => matchedPreferences.add(match));
  }

  if (context.targetRoles && context.targetRoles.length > 0) {
    const normalizedRoles = context.targetRoles.map((role) => normalizeText(role));
    const roleMatches = normalizedRoles.filter((role) => titleTokens.includes(role) || normalizeText(job.title).includes(role));
    score += Math.round((roleMatches.length / normalizedRoles.length) * 25);
    roleMatches.forEach((match) => matchedPreferences.add(match));
  }

  if (context.targetCountries && context.targetCountries.length > 0) {
    const normalizedCountries = context.targetCountries.map((country) => country.toLowerCase());
    const countryMatches = normalizedCountries.filter(
      (country) => locationText.includes(country) || countryTokens.includes(country),
    );
    score += Math.round((countryMatches.length / normalizedCountries.length) * 20);
    countryMatches.forEach((match) => matchedPreferences.add(match.toUpperCase()));
  }

  if (context.locations && context.locations.length > 0) {
    const normalizedLocations = context.locations.map((location) => normalizeText(location));
    const locationMatches = normalizedLocations.filter((location) => locationText.includes(location));
    score += Math.round((locationMatches.length / normalizedLocations.length) * 10);
    locationMatches.forEach((match) => matchedPreferences.add(match));
  }

  if (context.requiresVisaSponsorship) {
    if (job.visaSponsorship === "YES") {
      score += 7;
      matchedPreferences.add("visa sponsorship");
    }
  } else {
    score += 3;
  }

  if (context.remoteOnly) {
    if (isRemoteLocation(job.location)) {
      score += 3;
      matchedPreferences.add("remote");
    }
  } else {
    score += 2;
  }

  if (context.prefersRelocationSupport) {
    if (job.relocationAssistance) {
      score += 5;
      matchedPreferences.add("relocation support");
    }
  } else if (job.relocationAssistance) {
    score += 2;
  }

  return { score: clamp(score), matchedPreferences: Array.from(matchedPreferences).slice(0, 6) };
}

function evaluateRelevance(job: JobDocumentLike, context?: CandidatePreferenceContext): number {
  const queryTerms = uniqueBy(
    [
      ...(context?.keywords || []),
      ...(context?.query ? tokenize(context.query) : []),
    ]
      .map((term) => normalizeText(term))
      .filter(Boolean),
    (term) => term,
  );

  if (queryTerms.length === 0) {
    return 60;
  }

  const titleText = normalizeText(job.title);
  const descriptionText = normalizeText(job.description);
  const tagText = (job.tags || []).map((tag) => normalizeText(tag)).join(" ");
  const companyText = normalizeText(companyName(job));

  let score = 0;

  for (const term of queryTerms) {
    if (titleText.includes(term)) score += 24;
    else if (tagText.includes(term)) score += 18;
    else if (descriptionText.includes(term)) score += 10;
    else if (companyText.includes(term)) score += 8;
  }

  return clamp(Math.round((score / (queryTerms.length * 24)) * 100));
}

function evaluateMobilityRelevance(job: JobDocumentLike, context?: CandidatePreferenceContext): number {
  if (!context) return job.visaSponsorship === "YES" || job.relocationAssistance ? 72 : 52;

  let score = 50;
  if (context.requiresVisaSponsorship) {
    score = job.visaSponsorship === "YES" ? 100 : 5;
  } else if (job.visaSponsorship === "YES") {
    score += 12;
  }

  if (context.prefersRelocationSupport) {
    score += job.relocationAssistance ? 18 : -8;
  } else if (job.relocationAssistance) {
    score += 8;
  }

  if (context.remoteOnly) {
    score += isRemoteLocation(job.location) ? 10 : -10;
  }

  return clamp(score);
}

function computeApplicationLikelihoodScore(input: {
  quality: JobQualityEvaluation;
  freshness: JobFreshnessEvaluation;
  employerTrust: number;
  salaryTransparency: number;
  mobilityRelevance: number;
  preferenceMatch: PreferenceMatchEvaluation;
}): number {
  return clamp(Math.round(
    input.quality.score * 0.38 +
    input.freshness.score * 0.2 +
    input.employerTrust * 0.16 +
    input.salaryTransparency * 0.12 +
    input.mobilityRelevance * 0.06 +
    input.preferenceMatch.score * 0.08,
  ));
}

function buildExplanation(input: {
  score: number;
  relevance: number;
  freshness: JobFreshnessEvaluation;
  applicationLikelihood: number;
  employerTrust: number;
  salaryTransparency: number;
  mobilityRelevance: number;
  preferenceMatch: PreferenceMatchEvaluation;
  quality: JobQualityEvaluation;
  sourceLineage: JobSourceLineageRecord[];
  sourceVerification: JobDiscoverySummary["sourceVerification"];
  applyPathType: JobDiscoverySummary["applyPathType"];
}): JobRankingExplanation {
  const reasons: string[] = [];

  if (input.relevance >= 70) reasons.push("Strong relevance to your search");
  if (input.preferenceMatch.score >= 70) reasons.push("Matches your profile preferences");
  if (input.freshness.score >= 85) reasons.push("Recently refreshed job listing");
  if (input.employerTrust >= 70) reasons.push("Verified or reviewed employer");
  if (input.salaryTransparency >= 65) reasons.push("Salary range is disclosed");
  if (input.mobilityRelevance >= 75) reasons.push("Visa or relocation details match");
  if (input.quality.score >= 75) reasons.push("High-quality, complete job details");
  if (input.sourceLineage.length > 1) reasons.push("Merged from multiple trusted sources");
  if (input.sourceVerification === "DIRECT_EMPLOYER") reasons.push("Posted directly by the employer on AfriTalent");
  if (input.sourceVerification === "ATS_PRIMARY") reasons.push("Links to a primary employer ATS application path");
  if (input.applyPathType === "BOARD") reasons.push("Application continues on the source board");
  if (reasons.length === 0) reasons.push("Balanced mix of freshness and quality");

  return {
    score: input.score,
    summary: reasons.slice(0, 3).join(" • "),
    reasons,
    matchedPreferences: input.preferenceMatch.matchedPreferences,
    components: {
      relevance: input.relevance,
      freshness: input.freshness.score,
      applicationLikelihood: input.applicationLikelihood,
      employerTrust: input.employerTrust,
      salaryTransparency: input.salaryTransparency,
      mobilityRelevance: input.mobilityRelevance,
      candidatePreferenceMatch: input.preferenceMatch.score,
      quality: input.quality.score,
    },
  };
}

export function buildJobDiscoverySummary(input: {
  quality: JobQualityEvaluation;
  freshness: JobFreshnessEvaluation;
  applicationLikelihoodScore: number;
  employerTrust: number;
  sourceLineage: JobSourceLineageRecord[];
  job: JobDocumentLike;
}): JobDiscoverySummary {
  const applyPathType = detectApplyPathType(input.job);
  const sourceVerification = detectSourceVerification(input.job, input.sourceLineage);
  const verifiedApplyPath = applyPathType === "DIRECT" || applyPathType === "ATS";
  const trustedSource = sourceVerification === "DIRECT_EMPLOYER" || sourceVerification === "ATS_PRIMARY" || sourceVerification === "AGGREGATOR_VERIFIED";
  const sourceNames = uniqueBy(
    input.sourceLineage
      .map((lineage) => lineage.source || lineage.company || "")
      .filter(Boolean),
    (value) => value,
  );

  return {
    qualityScore: input.quality.score,
    freshnessScore: input.freshness.score,
    applicationLikelihoodScore: input.applicationLikelihoodScore,
    trustedJob:
      input.quality.score >= 70 &&
      input.freshness.score >= 40 &&
      input.employerTrust >= 60 &&
      trustedSource &&
      verifiedApplyPath &&
      !input.freshness.isStale,
    stale: input.freshness.isStale,
    freshnessLabel: input.freshness.label,
    qualityLabel: input.quality.label,
    salaryTransparent: input.quality.signals.compensationTransparent,
    verifiedEmployer: input.quality.signals.verifiedEmployer,
    visaClear: input.quality.signals.mobilityClear && input.quality.signals.validApplicationPath,
    relocationClear: input.quality.signals.mobilityClear,
    validApplicationPath: input.quality.signals.validApplicationPath,
    verifiedApplyPath,
    trustedSource,
    applyPathType,
    sourceVerification,
    deliveryModel: detectDeliveryModel(input.job),
    sourceCount: input.sourceLineage.length,
    sourceNames,
    lastSeenAt: input.sourceLineage[0]?.lastSeenAt ?? input.freshness.referenceAt?.toISOString() ?? null,
  };
}

export function buildJobIntelligenceUpdate(
  job: JobDocumentLike,
  existingLineage?: unknown,
  relatedJobs: JobDocumentLike[] = [job],
  now = new Date(),
) {
  const mergedLineage = mergeSourceLineage(existingLineage, relatedJobs, now);
  const freshness = evaluateFreshness(
    {
      ...job,
      sourceFirstSeenAt: job.sourceFirstSeenAt ?? mergedLineage.at(-1)?.firstSeenAt ?? null,
      sourceLastSeenAt: job.sourceLastSeenAt ?? mergedLineage[0]?.lastSeenAt ?? null,
    },
    now,
  );
  const quality = evaluateJobQuality(job);
  const employerTrust = employerTrustScore(job);
  const preferenceMatch = { score: 50, matchedPreferences: [] };
  const applicationLikelihoodScore = computeApplicationLikelihoodScore({
    quality,
    freshness,
    employerTrust,
    salaryTransparency: salaryTransparencyScore(job),
    mobilityRelevance: evaluateMobilityRelevance(job),
    preferenceMatch,
  });

  return {
    applicationUrl: job.applicationUrl ?? null,
    sourceFingerprint: buildSourceFingerprint(job),
    sourceLineage: mergedLineage as unknown as Prisma.InputJsonValue,
    sourceFirstSeenAt: mergedLineage.at(-1) ? new Date(mergedLineage.at(-1)!.firstSeenAt) : toDate(job.publishedAt),
    sourceLastSeenAt: mergedLineage[0] ? new Date(mergedLineage[0].lastSeenAt) : toDate(job.publishedAt),
    freshnessScore: freshness.score,
    qualityScore: quality.score,
    applicationLikelihoodScore,
    freshnessSignals: {
      label: freshness.label,
      ageDays: freshness.ageDays,
      referenceAt: freshness.referenceAt?.toISOString() ?? null,
      staleAt: freshness.staleAt?.toISOString() ?? null,
      isStale: freshness.isStale,
    } as Prisma.InputJsonValue,
    qualitySignals: quality.signals as unknown as Prisma.InputJsonValue,
    staleAt: freshness.staleAt,
  };
}

export function scoreJobForSearch<TJob extends JobDocumentLike>(
  job: TJob,
  context?: CandidatePreferenceContext,
): RankedJobResult<TJob> {
  const sourceLineage = normalizeSourceLineage(job.sourceLineage);
  const mergedLineage = sourceLineage.length > 0 ? sourceLineage : mergeSourceLineage([], [job]);
  const freshness = evaluateFreshness(
    {
      ...job,
      sourceFirstSeenAt: job.sourceFirstSeenAt ?? mergedLineage.at(-1)?.firstSeenAt ?? null,
      sourceLastSeenAt: job.sourceLastSeenAt ?? mergedLineage[0]?.lastSeenAt ?? null,
    },
  );
  const quality = evaluateJobQuality(job);
  const employerTrust = employerTrustScore(job);
  const preferenceMatch = evaluateCandidatePreferenceMatch(job, context);
  const relevance = evaluateRelevance(job, context);
  const salaryTransparency = salaryTransparencyScore(job);
  const mobilityRelevance = evaluateMobilityRelevance(job, context);
  const applicationLikelihood = computeApplicationLikelihoodScore({
    quality,
    freshness,
    employerTrust,
    salaryTransparency,
    mobilityRelevance,
    preferenceMatch,
  });

  let score = Math.round(
    relevance * 0.32 +
    freshness.score * 0.15 +
    applicationLikelihood * 0.12 +
    employerTrust * 0.12 +
    salaryTransparency * 0.08 +
    mobilityRelevance * 0.06 +
    preferenceMatch.score * 0.1 +
    quality.score * 0.05,
  );

  if (freshness.isStale) {
    score -= 18;
  }
  if (riskLevelValue(job.riskLevel) === TrustRiskLevel.HIGH) {
    score -= 16;
  }
  if (riskLevelValue(job.riskLevel) === TrustRiskLevel.CRITICAL) {
    score -= 24;
  }

  const normalizedScore = clamp(score);
  const explanation = buildExplanation({
    score: normalizedScore,
    relevance,
    freshness,
    applicationLikelihood,
    employerTrust,
    salaryTransparency,
    mobilityRelevance,
    preferenceMatch,
    quality,
    sourceLineage: mergedLineage,
    sourceVerification: detectSourceVerification(job, mergedLineage),
    applyPathType: detectApplyPathType(job),
  });
  const discovery = buildJobDiscoverySummary({
    quality,
    freshness,
    applicationLikelihoodScore: applicationLikelihood,
    employerTrust,
    sourceLineage: mergedLineage,
    job,
  });

  return {
    job,
    score: normalizedScore,
    explanation,
    discovery,
    fingerprint: buildSourceFingerprint(job),
    sourceLineage: mergedLineage,
  };
}

export function collapseDuplicateRankedJobs<TJob extends JobDocumentLike>(
  rankedJobs: RankedJobResult<TJob>[],
): RankedJobResult<TJob>[] {
  const canonical = new Map<string, RankedJobResult<TJob>>();

  for (const rankedJob of rankedJobs) {
    const existing = canonical.get(rankedJob.fingerprint);
    if (!existing || rankedJob.score > existing.score) {
      canonical.set(rankedJob.fingerprint, rankedJob);
    }
  }

  return Array.from(canonical.values()).sort((left, right) => right.score - left.score);
}
