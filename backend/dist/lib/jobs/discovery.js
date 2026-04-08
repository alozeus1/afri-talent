import crypto from "crypto";
import { EmployerVerificationLevel, TrustRiskLevel } from "@prisma/client";
const STALE_THRESHOLD_DAYS = parseInt(process.env.JOB_STALE_DAYS || "30", 10);
const GENERIC_LOCATION_PATTERNS = ["tbd", "various", "multiple", "to be determined"];
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
function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, value));
}
function toDate(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
function normalizeText(value) {
    return (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokenize(value) {
    return Array.from(new Set(normalizeText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token))));
}
function isRemoteLocation(location) {
    return normalizeText(location).includes("remote");
}
function companyName(job) {
    return job.employer?.companyName || job.sourceName || "unknown";
}
function canonicalUrl(value) {
    if (!value)
        return "";
    try {
        const parsed = new URL(value);
        return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
    }
    catch {
        return normalizeText(value);
    }
}
function riskLevelValue(level) {
    if (level === TrustRiskLevel.MEDIUM || level === TrustRiskLevel.HIGH || level === TrustRiskLevel.CRITICAL) {
        return level;
    }
    return TrustRiskLevel.LOW;
}
function verificationValue(level) {
    if (level === EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED ||
        level === EmployerVerificationLevel.BUSINESS_DOC_VERIFIED ||
        level === EmployerVerificationLevel.MANUAL_REVIEW_APPROVED ||
        level === EmployerVerificationLevel.PREMIUM_TRUSTED) {
        return level;
    }
    return EmployerVerificationLevel.UNVERIFIED;
}
function buildLineageEntry(job, now = new Date()) {
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
function uniqueBy(items, keyFn) {
    const seen = new Map();
    for (const item of items) {
        seen.set(keyFn(item), item);
    }
    return Array.from(seen.values());
}
export function normalizeSourceLineage(lineage) {
    if (!Array.isArray(lineage)) {
        return [];
    }
    const normalized = lineage.flatMap((item) => {
        if (!item || typeof item !== "object") {
            return [];
        }
        const candidate = item;
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
export function mergeSourceLineage(existingLineage, incomingJobs, now = new Date()) {
    const merged = [...normalizeSourceLineage(existingLineage)];
    for (const job of incomingJobs) {
        const entry = buildLineageEntry(job, now);
        const key = entry.sourceId || entry.sourceUrl || `${entry.source}:${entry.company}`;
        const existing = merged.find((item) => (item.sourceId || item.sourceUrl || `${item.source}:${item.company}`) === key);
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
export function buildSourceFingerprint(job) {
    const normalizedTitle = normalizeText(job.title);
    const normalizedCompany = normalizeText(companyName(job));
    const normalizedLocation = normalizeText(job.location);
    const urlSeed = canonicalUrl(job.sourceUrl);
    const seed = normalizedCompany && normalizedCompany !== "unknown"
        ? [normalizedTitle, normalizedCompany, normalizedLocation].join("|")
        : [normalizedTitle, normalizedCompany, normalizedLocation, urlSeed].join("|");
    return crypto.createHash("sha1").update(seed).digest("hex");
}
function employerTrustScore(job) {
    const trustProfile = job.employer?.trustProfile;
    if (!trustProfile) {
        return 38;
    }
    const verification = verificationValue(trustProfile.verificationLevel);
    const verificationScore = {
        [EmployerVerificationLevel.UNVERIFIED]: 35,
        [EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED]: 55,
        [EmployerVerificationLevel.BUSINESS_DOC_VERIFIED]: 74,
        [EmployerVerificationLevel.MANUAL_REVIEW_APPROVED]: 88,
        [EmployerVerificationLevel.PREMIUM_TRUSTED]: 96,
    }[verification];
    const authenticity = clamp(trustProfile.authenticityScore ?? 0);
    const riskPenalty = clamp((trustProfile.riskScore ?? 0) * 0.8, 0, 40);
    return clamp(Math.round(verificationScore * 0.6 + authenticity * 0.4 - riskPenalty * 0.35));
}
function salaryTransparencyScore(job) {
    const hasMin = typeof job.salaryMin === "number";
    const hasMax = typeof job.salaryMax === "number";
    const hasCurrency = Boolean(job.currency);
    if (hasMin && hasMax && hasCurrency)
        return 100;
    if ((hasMin || hasMax) && hasCurrency)
        return 65;
    return 0;
}
function hasValidExternalUrl(value) {
    if (!value)
        return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    }
    catch {
        return false;
    }
}
export function evaluateFreshness(job, now = new Date()) {
    const referenceAt = toDate(job.sourceLastSeenAt) ??
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
export function evaluateJobQuality(job) {
    const normalizedDescription = normalizeText(job.description);
    const riskLevel = riskLevelValue(job.riskLevel);
    const signals = {
        verifiedEmployer: employerTrustScore(job) >= 70,
        descriptionComplete: normalizedDescription.length >= 280 || normalizedDescription.split(" ").length >= 80,
        compensationTransparent: salaryTransparencyScore(job) >= 65,
        validApplicationPath: Boolean(job.applicationUrl || job.employer?.companyName) && (hasValidExternalUrl(job.applicationUrl) ||
            hasValidExternalUrl(job.sourceUrl) ||
            Boolean(job.employer?.companyName)),
        locationClear: Boolean(normalizeText(job.location)) &&
            !GENERIC_LOCATION_PATTERNS.some((pattern) => normalizeText(job.location).includes(pattern)),
        mobilityClear: job.visaSponsorship !== "UNKNOWN" ||
            Boolean(job.relocationAssistance) ||
            Boolean(job.eligibleCountries && job.eligibleCountries.length > 0),
        lowScamRisk: (job.riskScore ?? 0) < 45 &&
            riskLevel !== TrustRiskLevel.HIGH &&
            riskLevel !== TrustRiskLevel.CRITICAL,
        metadataRich: Boolean(job.seniority) || Boolean(job.tags && job.tags.length >= 3),
    };
    const score = (signals.verifiedEmployer ? 20 : 0) +
        (signals.descriptionComplete ? 20 : 0) +
        (signals.compensationTransparent ? 14 : 0) +
        (signals.validApplicationPath ? 14 : 0) +
        (signals.locationClear ? 10 : 0) +
        (signals.mobilityClear ? 8 : 0) +
        (signals.lowScamRisk ? 10 : 0) +
        (signals.metadataRich ? 4 : 0);
    let label = "THIN";
    if (score >= 82)
        label = "TRUSTED";
    else if (score >= 64)
        label = "SOLID";
    else if (score >= 44)
        label = "REVIEW";
    return { score, label, signals };
}
export function evaluateCandidatePreferenceMatch(job, context) {
    if (!context) {
        return { score: 50, matchedPreferences: [] };
    }
    const matchedPreferences = new Set();
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
        const countryMatches = normalizedCountries.filter((country) => locationText.includes(country) || countryTokens.includes(country));
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
    }
    else {
        score += 3;
    }
    if (context.remoteOnly) {
        if (isRemoteLocation(job.location)) {
            score += 3;
            matchedPreferences.add("remote");
        }
    }
    else {
        score += 2;
    }
    if (context.prefersRelocationSupport) {
        if (job.relocationAssistance) {
            score += 5;
            matchedPreferences.add("relocation support");
        }
    }
    else if (job.relocationAssistance) {
        score += 2;
    }
    return { score: clamp(score), matchedPreferences: Array.from(matchedPreferences).slice(0, 6) };
}
function evaluateRelevance(job, context) {
    const queryTerms = uniqueBy([
        ...(context?.keywords || []),
        ...(context?.query ? tokenize(context.query) : []),
    ]
        .map((term) => normalizeText(term))
        .filter(Boolean), (term) => term);
    if (queryTerms.length === 0) {
        return 60;
    }
    const titleText = normalizeText(job.title);
    const descriptionText = normalizeText(job.description);
    const tagText = (job.tags || []).map((tag) => normalizeText(tag)).join(" ");
    const companyText = normalizeText(companyName(job));
    let score = 0;
    for (const term of queryTerms) {
        if (titleText.includes(term))
            score += 24;
        else if (tagText.includes(term))
            score += 18;
        else if (descriptionText.includes(term))
            score += 10;
        else if (companyText.includes(term))
            score += 8;
    }
    return clamp(Math.round((score / (queryTerms.length * 24)) * 100));
}
function evaluateMobilityRelevance(job, context) {
    if (!context)
        return job.visaSponsorship === "YES" || job.relocationAssistance ? 72 : 52;
    let score = 50;
    if (context.requiresVisaSponsorship) {
        score = job.visaSponsorship === "YES" ? 100 : 5;
    }
    else if (job.visaSponsorship === "YES") {
        score += 12;
    }
    if (context.prefersRelocationSupport) {
        score += job.relocationAssistance ? 18 : -8;
    }
    else if (job.relocationAssistance) {
        score += 8;
    }
    if (context.remoteOnly) {
        score += isRemoteLocation(job.location) ? 10 : -10;
    }
    return clamp(score);
}
function computeApplicationLikelihoodScore(input) {
    return clamp(Math.round(input.quality.score * 0.38 +
        input.freshness.score * 0.2 +
        input.employerTrust * 0.16 +
        input.salaryTransparency * 0.12 +
        input.mobilityRelevance * 0.06 +
        input.preferenceMatch.score * 0.08));
}
function buildExplanation(input) {
    const reasons = [];
    if (input.relevance >= 70)
        reasons.push("Strong relevance to your search");
    if (input.preferenceMatch.score >= 70)
        reasons.push("Matches your profile preferences");
    if (input.freshness.score >= 85)
        reasons.push("Recently refreshed job listing");
    if (input.employerTrust >= 70)
        reasons.push("Verified or reviewed employer");
    if (input.salaryTransparency >= 65)
        reasons.push("Salary range is disclosed");
    if (input.mobilityRelevance >= 75)
        reasons.push("Visa or relocation details match");
    if (input.quality.score >= 75)
        reasons.push("High-quality, complete job details");
    if (input.sourceLineage.length > 1)
        reasons.push("Merged from multiple trusted sources");
    if (reasons.length === 0)
        reasons.push("Balanced mix of freshness and quality");
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
export function buildJobDiscoverySummary(input) {
    const sourceNames = uniqueBy(input.sourceLineage
        .map((lineage) => lineage.source || lineage.company || "")
        .filter(Boolean), (value) => value);
    return {
        qualityScore: input.quality.score,
        freshnessScore: input.freshness.score,
        applicationLikelihoodScore: input.applicationLikelihoodScore,
        trustedJob: input.quality.score >= 70 &&
            input.freshness.score >= 40 &&
            input.employerTrust >= 60 &&
            !input.freshness.isStale,
        stale: input.freshness.isStale,
        freshnessLabel: input.freshness.label,
        qualityLabel: input.quality.label,
        salaryTransparent: input.quality.signals.compensationTransparent,
        verifiedEmployer: input.quality.signals.verifiedEmployer,
        visaClear: input.quality.signals.mobilityClear && input.quality.signals.validApplicationPath,
        relocationClear: input.quality.signals.mobilityClear,
        validApplicationPath: input.quality.signals.validApplicationPath,
        sourceCount: input.sourceLineage.length,
        sourceNames,
        lastSeenAt: input.sourceLineage[0]?.lastSeenAt ?? input.freshness.referenceAt?.toISOString() ?? null,
    };
}
export function buildJobIntelligenceUpdate(job, existingLineage, relatedJobs = [job], now = new Date()) {
    const mergedLineage = mergeSourceLineage(existingLineage, relatedJobs, now);
    const freshness = evaluateFreshness({
        ...job,
        sourceFirstSeenAt: job.sourceFirstSeenAt ?? mergedLineage.at(-1)?.firstSeenAt ?? null,
        sourceLastSeenAt: job.sourceLastSeenAt ?? mergedLineage[0]?.lastSeenAt ?? null,
    }, now);
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
        sourceLineage: mergedLineage,
        sourceFirstSeenAt: mergedLineage.at(-1) ? new Date(mergedLineage.at(-1).firstSeenAt) : toDate(job.publishedAt),
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
        },
        qualitySignals: quality.signals,
        staleAt: freshness.staleAt,
    };
}
export function scoreJobForSearch(job, context) {
    const sourceLineage = normalizeSourceLineage(job.sourceLineage);
    const mergedLineage = sourceLineage.length > 0 ? sourceLineage : mergeSourceLineage([], [job]);
    const freshness = evaluateFreshness({
        ...job,
        sourceFirstSeenAt: job.sourceFirstSeenAt ?? mergedLineage.at(-1)?.firstSeenAt ?? null,
        sourceLastSeenAt: job.sourceLastSeenAt ?? mergedLineage[0]?.lastSeenAt ?? null,
    });
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
    let score = Math.round(relevance * 0.32 +
        freshness.score * 0.15 +
        applicationLikelihood * 0.12 +
        employerTrust * 0.12 +
        salaryTransparency * 0.08 +
        mobilityRelevance * 0.06 +
        preferenceMatch.score * 0.1 +
        quality.score * 0.05);
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
    });
    const discovery = buildJobDiscoverySummary({
        quality,
        freshness,
        applicationLikelihoodScore: applicationLikelihood,
        employerTrust,
        sourceLineage: mergedLineage,
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
export function collapseDuplicateRankedJobs(rankedJobs) {
    const canonical = new Map();
    for (const rankedJob of rankedJobs) {
        const existing = canonical.get(rankedJob.fingerprint);
        if (!existing || rankedJob.score > existing.score) {
            canonical.set(rankedJob.fingerprint, rankedJob);
        }
    }
    return Array.from(canonical.values()).sort((left, right) => right.score - left.score);
}
//# sourceMappingURL=discovery.js.map