import {
  CandidateVerificationLevel,
  EmployerVerificationLevel,
  TrustRiskLevel,
} from "@prisma/client";
import { domainFromEmail, isThrowawayDomain, normalizeDomain } from "./throwaway-domains.js";

const CONTACT_SCAM_PATTERNS = [
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /\bcontact me on\b/i,
  /\bemail me directly\b/i,
  /\bsend your cv to\b/i,
  /\bgmail\.com\b/i,
  /\byahoo\.com\b/i,
  /\boutlook\.com\b/i,
];

const ADVANCE_FEE_PATTERNS = [
  /\bapplication fee\b/i,
  /\btraining fee\b/i,
  /\bregistration fee\b/i,
  /\bprocessing fee\b/i,
  /\bsecurity deposit\b/i,
  /\bpay to proceed\b/i,
  /\bcrypto\b/i,
];

const LOW_TRUST_JOB_PATTERNS = [
  /\bquick money\b/i,
  /\bguaranteed income\b/i,
  /\bno experience needed\b/i,
  /\bearn \$?\d{3,} per day\b/i,
  /\bstart immediately\b/i,
];

export interface RiskAssessment {
  score: number;
  level: TrustRiskLevel;
  flags: string[];
  autoHold: boolean;
}

export interface EmployerTrustAssessment {
  authenticityScore: number;
  riskScore: number;
  riskLevel: TrustRiskLevel;
  verificationLevel: EmployerVerificationLevel;
  postingEligibility: boolean;
  requiresEnhancedVerification: boolean;
  verifiedDomain: string | null;
  websiteMatchesEmail: boolean;
  throwawayDomainDetected: boolean;
  warnings: string[];
}

export interface CandidateTrustAssessment {
  authenticityScore: number;
  riskScore: number;
  riskLevel: TrustRiskLevel;
  verificationLevel: CandidateVerificationLevel;
  premiumFilterEligible: boolean;
  warnings: string[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function riskLevelForScore(score: number): TrustRiskLevel {
  if (score >= 80) return TrustRiskLevel.CRITICAL;
  if (score >= 55) return TrustRiskLevel.HIGH;
  if (score >= 25) return TrustRiskLevel.MEDIUM;
  return TrustRiskLevel.LOW;
}

function collectPatternFlags(text: string, patterns: RegExp[], label: string): string[] {
  return patterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => `${label}:${pattern.source}`);
}

export function assessContentRisk(text: string): RiskAssessment {
  const normalized = text.trim();
  const flags = [
    ...collectPatternFlags(normalized, CONTACT_SCAM_PATTERNS, "off_platform_contact"),
    ...collectPatternFlags(normalized, ADVANCE_FEE_PATTERNS, "advance_fee"),
    ...collectPatternFlags(normalized, LOW_TRUST_JOB_PATTERNS, "spam_language"),
  ];

  let score = 0;
  for (const flag of flags) {
    if (flag.startsWith("advance_fee")) score += 35;
    else if (flag.startsWith("off_platform_contact")) score += 20;
    else score += 12;
  }

  return {
    score: clamp(score),
    level: riskLevelForScore(score),
    flags,
    autoHold: score >= 55,
  };
}

export function assessEmployerTrust(input: {
  email: string;
  website?: string | null;
  linkedInCompanyUrl?: string | null;
  approvedBusinessDocs: number;
  approvedManualReviews: number;
  openReports: number;
  postingVelocity24h: number;
  isPremiumSubscription: boolean;
}): EmployerTrustAssessment {
  const emailDomain = domainFromEmail(input.email);
  const websiteDomain = normalizeDomain(input.website);
  const throwaway = isThrowawayDomain(emailDomain);
  const websiteMatchesEmail =
    Boolean(emailDomain && websiteDomain) &&
    (websiteDomain === emailDomain || websiteDomain.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${websiteDomain}`));

  let authenticityScore = 0;
  let riskScore = 0;
  const warnings: string[] = [];
  let verificationLevel = EmployerVerificationLevel.UNVERIFIED;

  if (emailDomain && !throwaway) {
    authenticityScore += 20;
  }

  if (websiteDomain) {
    authenticityScore += 10;
  } else {
    riskScore += 10;
    warnings.push("Add your company website to improve trust.");
  }

  if (websiteMatchesEmail && emailDomain && !throwaway) {
    authenticityScore += 30;
    verificationLevel = EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED;
  } else if (emailDomain && !throwaway && websiteDomain) {
    riskScore += 18;
    warnings.push("Your account email domain does not match the company website.");
  }

  if (input.linkedInCompanyUrl) {
    authenticityScore += 10;
  }

  if (input.approvedBusinessDocs > 0) {
    authenticityScore += 20;
    verificationLevel = EmployerVerificationLevel.BUSINESS_DOC_VERIFIED;
  }

  if (input.approvedManualReviews > 0) {
    authenticityScore += 15;
    verificationLevel = EmployerVerificationLevel.MANUAL_REVIEW_APPROVED;
  }

  if (input.isPremiumSubscription && verificationLevel === EmployerVerificationLevel.MANUAL_REVIEW_APPROVED) {
    authenticityScore += 5;
    verificationLevel = EmployerVerificationLevel.PREMIUM_TRUSTED;
  }

  if (throwaway) {
    riskScore += 40;
    warnings.push("Use a company email address instead of a free inbox provider.");
  }

  if (input.openReports > 0) {
    riskScore += Math.min(30, input.openReports * 12);
    warnings.push("Your account has unresolved trust reports and may need review.");
  }

  const requiresEnhancedVerification = input.postingVelocity24h >= 5 || input.openReports >= 2;
  if (requiresEnhancedVerification) {
    riskScore += 15;
    warnings.push("Higher posting volume requires stronger verification before publishing.");
  }

  const minimumThresholdMet = verificationLevel !== EmployerVerificationLevel.UNVERIFIED;
  const strongThresholdMet = [
    EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
    EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
    EmployerVerificationLevel.PREMIUM_TRUSTED,
  ].includes(verificationLevel);

  const postingEligibility =
    riskScore < 55 &&
    (requiresEnhancedVerification ? strongThresholdMet : minimumThresholdMet);

  return {
    authenticityScore: clamp(authenticityScore),
    riskScore: clamp(riskScore),
    riskLevel: riskLevelForScore(riskScore),
    verificationLevel,
    postingEligibility,
    requiresEnhancedVerification,
    verifiedDomain: websiteMatchesEmail ? emailDomain : null,
    websiteMatchesEmail,
    throwawayDomainDetected: throwaway,
    warnings,
  };
}

export function assessCandidateTrust(input: {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  skillsVerified: boolean;
  employmentVerified: boolean;
  hasLinkedIn: boolean;
  hasGitHub: boolean;
  hasPortfolio: boolean;
  profileCompleteness: number;
  openReports: number;
  applicationsLast24h: number;
}): CandidateTrustAssessment {
  let authenticityScore = 0;
  let riskScore = 0;
  const warnings: string[] = [];
  let verificationLevel = CandidateVerificationLevel.UNVERIFIED;

  if (input.emailVerified) {
    authenticityScore += 20;
    verificationLevel = CandidateVerificationLevel.EMAIL_VERIFIED;
  }

  if (input.phoneVerified) {
    authenticityScore += 20;
    verificationLevel = CandidateVerificationLevel.PHONE_VERIFIED;
  }

  if (input.identityVerified) {
    authenticityScore += 25;
    verificationLevel = CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED;
  }

  if (input.skillsVerified) {
    authenticityScore += 15;
    verificationLevel = CandidateVerificationLevel.SKILLS_VERIFIED;
  }

  if (input.employmentVerified) {
    authenticityScore += 10;
    verificationLevel = CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED;
  }

  if (input.hasLinkedIn) authenticityScore += 5;
  if (input.hasGitHub) authenticityScore += 5;
  if (input.hasPortfolio) authenticityScore += 5;

  if (input.profileCompleteness < 40) {
    riskScore += 10;
    warnings.push("Complete more of your profile to improve authenticity.");
  } else if (input.profileCompleteness >= 80) {
    authenticityScore += 5;
  }

  if (input.openReports > 0) {
    riskScore += Math.min(30, input.openReports * 10);
    warnings.push("Your account has unresolved trust reports.");
  }

  if (input.applicationsLast24h >= 20) {
    riskScore += 25;
    warnings.push("High-volume applications can trigger anti-spam review.");
  } else if (input.applicationsLast24h >= 10) {
    riskScore += 10;
  }

  const premiumFilterEligible =
    authenticityScore >= 60 &&
    riskScore < 40 &&
    verificationLevel !== CandidateVerificationLevel.UNVERIFIED;

  return {
    authenticityScore: clamp(authenticityScore),
    riskScore: clamp(riskScore),
    riskLevel: riskLevelForScore(riskScore),
    verificationLevel,
    premiumFilterEligible,
    warnings,
  };
}

export function assessJobPostingRisk(input: {
  title: string;
  description: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  employerRiskScore: number;
}): RiskAssessment {
  const content = `${input.title}\n${input.description}`;
  const contentRisk = assessContentRisk(content);
  let score = contentRisk.score + Math.floor(input.employerRiskScore * 0.35);
  const flags = [...contentRisk.flags];

  if (input.salaryMin && input.salaryMax && input.salaryMax > input.salaryMin * 3) {
    score += 12;
    flags.push("misleading_salary_range");
  }

  if (input.salaryMax && input.salaryMax >= 500000 && input.description.length < 160) {
    score += 10;
    flags.push("salary_bait_short_description");
  }

  return {
    score: clamp(score),
    level: riskLevelForScore(score),
    flags,
    autoHold: score >= 55,
  };
}

export function assessApplicationRisk(input: {
  coverLetter?: string | null;
  applicationsLast24h: number;
  candidateRiskScore: number;
}): RiskAssessment {
  const contentRisk = input.coverLetter ? assessContentRisk(input.coverLetter) : {
    score: 0,
    level: TrustRiskLevel.LOW,
    flags: [],
    autoHold: false,
  };

  let score = contentRisk.score + Math.floor(input.candidateRiskScore * 0.45);
  const flags = [...contentRisk.flags];

  if (input.applicationsLast24h >= 20) {
    score += 35;
    flags.push("application_velocity_extreme");
  } else if (input.applicationsLast24h >= 10) {
    score += 18;
    flags.push("application_velocity_high");
  }

  return {
    score: clamp(score),
    level: riskLevelForScore(score),
    flags,
    autoHold: score >= 60,
  };
}

export function employerBadgeLabel(level: EmployerVerificationLevel): string {
  switch (level) {
    case EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED:
      return "Domain verified employer";
    case EmployerVerificationLevel.BUSINESS_DOC_VERIFIED:
      return "Business-doc verified employer";
    case EmployerVerificationLevel.MANUAL_REVIEW_APPROVED:
      return "Manually reviewed employer";
    case EmployerVerificationLevel.PREMIUM_TRUSTED:
      return "Premium trusted employer";
    default:
      return "Unverified employer";
  }
}

export function candidateBadgeLabel(level: CandidateVerificationLevel): string {
  switch (level) {
    case CandidateVerificationLevel.EMAIL_VERIFIED:
      return "Email verified";
    case CandidateVerificationLevel.PHONE_VERIFIED:
      return "Phone verified";
    case CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED:
      return "Identity verified";
    case CandidateVerificationLevel.SKILLS_VERIFIED:
      return "Skills verified";
    case CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED:
      return "Employment history checked";
    default:
      return "Unverified profile";
  }
}
