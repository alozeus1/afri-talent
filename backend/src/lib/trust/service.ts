import {
  AbuseReportReason,
  AbuseReportStatus,
  CandidatePartnerMarkerStatus,
  CandidateSkillVerificationMethod,
  CandidateSkillVerificationStatus,
  CandidateVerificationLevel,
  EmployerVerificationLevel,
  ModerationActionType,
  Prisma,
  Role,
  SubscriptionPlan,
  TrustEntityType,
  TrustRiskLevel,
  VerificationArtifactStatus,
  VerificationArtifactType,
} from "@prisma/client";
import prisma from "../prisma.js";
import {
  assessCandidateTrust,
  assessEmployerTrust,
  candidateBadgeLabel,
  employerBadgeLabel,
  riskLevelForScore,
} from "./risk.js";
import { domainFromEmail, normalizeDomain } from "./throwaway-domains.js";

function startOfWindow(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function restrictionFromRisk(level: TrustRiskLevel): {
  status: "ACTIVE" | "LIMITED" | "SUSPENDED";
  reason: string | null;
} {
  if (level === TrustRiskLevel.CRITICAL) {
    return { status: "SUSPENDED", reason: "Automatic suspension triggered by critical trust risk." };
  }
  if (level === TrustRiskLevel.HIGH) {
    return { status: "LIMITED", reason: "Account temporarily limited pending trust review." };
  }
  return { status: "ACTIVE", reason: null };
}

export function maskPhoneNumber(phoneNumber?: string | null): string | null {
  if (!phoneNumber) return null;
  const trimmed = phoneNumber.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function jsonArray(value: Prisma.JsonValue | null | undefined): Prisma.JsonArray {
  return Array.isArray(value) ? value : [];
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function countStructuredEntries(
  value: Prisma.JsonValue | null | undefined,
  requiredKeys: string[],
): number {
  return jsonArray(value).filter((entry) => {
    const record = jsonObject(entry);
    if (!record) return false;
    return requiredKeys.some((key) => hasText(record[key]));
  }).length;
}

function isWorkHistoryConsistent(value: Prisma.JsonValue | null | undefined): boolean {
  const entries = jsonArray(value)
    .map((entry) => jsonObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  if (entries.length === 0) return false;

  const strongEntries = entries.filter((entry) => {
    let signals = 0;
    if (hasText(entry.title)) signals += 1;
    if (hasText(entry.company)) signals += 1;
    if (hasText(entry.period)) signals += 1;
    if (hasText(entry.description)) signals += 1;
    return signals >= 2;
  }).length;

  return strongEntries >= Math.max(1, Math.ceil(entries.length * 0.6));
}

function buildCandidateExplainabilitySignals(input: {
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  hasResume: boolean;
  profileCompleteness: number;
  verifiedSkillCount: number;
  assessmentBackedSkillCount: number;
  partnerSignalCount: number;
  workHistoryEntries: number;
  workHistoryConsistent: boolean;
  educationEvidenceCount: number;
  certificationEvidenceCount: number;
  hasLinkedIn: boolean;
  hasGitHub: boolean;
  hasPortfolio: boolean;
}) {
  return [
    {
      key: "email",
      label: "Email verification",
      status: input.emailVerified ? "verified" : "needs_attention",
      detail: input.emailVerified
        ? "Email ownership is confirmed."
        : "Verify your email to establish baseline account trust.",
    },
    {
      key: "phone",
      label: "Phone verification",
      status: input.phoneVerified ? "verified" : "needs_attention",
      detail: input.phoneVerified
        ? "A verified phone number is attached to the profile."
        : "Phone verification helps employers trust candidate reachability.",
    },
    {
      key: "identity",
      label: "Identity evidence",
      status: input.identityVerified ? "verified" : "strengthening",
      detail: input.identityVerified
        ? "Identity documentation has been approved."
        : "Optional identity review adds a higher-confidence trust layer.",
    },
    {
      key: "profile",
      label: "Profile completeness",
      status:
        input.profileCompleteness >= 85
          ? "verified"
          : input.profileCompleteness >= 60
            ? "strengthening"
            : "needs_attention",
      detail: `${input.profileCompleteness}% of the trust-critical profile fields are complete.`,
    },
    {
      key: "resume",
      label: "Resume and work history",
      status:
        input.hasResume && input.workHistoryEntries > 0 && input.workHistoryConsistent
          ? "verified"
          : input.hasResume || input.workHistoryEntries > 0
            ? "strengthening"
            : "needs_attention",
      detail:
        input.hasResume && input.workHistoryEntries > 0
          ? `${input.workHistoryEntries} structured work entr${input.workHistoryEntries === 1 ? "y" : "ies"} captured.`
          : "Add an active resume and structured work history.",
    },
    {
      key: "skills",
      label: "Evidence-backed skills",
      status:
        input.verifiedSkillCount > 0
          ? "verified"
          : input.certificationEvidenceCount > 0 || input.assessmentBackedSkillCount > 0
            ? "strengthening"
            : "needs_attention",
      detail:
        input.verifiedSkillCount > 0
          ? `${input.verifiedSkillCount} verified skill badge${input.verifiedSkillCount === 1 ? "" : "s"} are visible to employers.`
          : "Add assessment, certificate, or portfolio-backed skill evidence.",
    },
    {
      key: "education",
      label: "Education and certification evidence",
      status:
        input.educationEvidenceCount > 0 || input.certificationEvidenceCount > 0
          ? "strengthening"
          : "needs_attention",
      detail:
        input.educationEvidenceCount > 0 || input.certificationEvidenceCount > 0
          ? `${input.educationEvidenceCount} education entr${input.educationEvidenceCount === 1 ? "y" : "ies"} and ${input.certificationEvidenceCount} certification signal${input.certificationEvidenceCount === 1 ? "" : "s"} are present.`
          : "Add education history or certification evidence to strengthen credibility.",
    },
    {
      key: "partner",
      label: "Partner-issued trust markers",
      status: input.partnerSignalCount > 0 ? "verified" : "strengthening",
      detail:
        input.partnerSignalCount > 0
          ? `${input.partnerSignalCount} university or training partner marker${input.partnerSignalCount === 1 ? "" : "s"} are active.`
          : "Partner-issued markers are optional but valuable for employer trust.",
    },
    {
      key: "links",
      label: "Public proof links",
      status:
        input.hasLinkedIn || input.hasGitHub || input.hasPortfolio
          ? "strengthening"
          : "needs_attention",
      detail:
        input.hasLinkedIn || input.hasGitHub || input.hasPortfolio
          ? "LinkedIn, GitHub, or portfolio links support authenticity review."
          : "Add LinkedIn, GitHub, or portfolio links to support your profile claims.",
    },
  ];
}

export async function ensureEmployerTrustProfile(employerId: string) {
  return prisma.employerTrustProfile.upsert({
    where: { employerId },
    create: { employerId },
    update: {},
  });
}

export async function ensureCandidateTrustProfile(userId: string) {
  return prisma.candidateTrustProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function refreshEmployerTrustProfile(employerId: string) {
  await ensureEmployerTrustProfile(employerId);

  const [employer, approvedBusinessDocs, approvedManualReviews, openReports, postingVelocity24h] =
    await Promise.all([
      prisma.employer.findUnique({
        where: { id: employerId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              emailVerified: true,
              accountRestrictionStatus: true,
            },
          },
          trustProfile: true,
        },
      }),
      prisma.verificationArtifact.count({
        where: {
          employerId,
          type: VerificationArtifactType.BUSINESS_REGISTRATION,
          status: VerificationArtifactStatus.APPROVED,
        },
      }),
      prisma.verificationArtifact.count({
        where: {
          employerId,
          type: VerificationArtifactType.DOMAIN_OWNERSHIP,
          status: VerificationArtifactStatus.APPROVED,
        },
      }),
      prisma.abuseReport.count({
        where: {
          employerId,
          status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED] },
        },
      }),
      prisma.job.count({
        where: {
          employerId,
          createdAt: { gte: startOfWindow(24) },
        },
      }),
    ]);

  if (!employer) {
    throw new Error("Employer not found");
  }

  const [subscription, duplicateCompanyNameMatches, duplicateDomainMatches] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: employer.userId },
      select: { plan: true },
    }).catch(() => null),
    prisma.employer.count({
      where: {
        id: { not: employerId },
        companyName: {
          equals: employer.companyName,
          mode: "insensitive",
        },
      },
    }),
    (async () => {
      const lookupDomain =
        normalizeDomain(employer.website) ?? domainFromEmail(employer.user.email);

      if (!lookupDomain) {
        return 0;
      }

      return prisma.employer.count({
        where: {
          id: { not: employerId },
          OR: [
            {
              website: {
                contains: lookupDomain,
                mode: "insensitive",
              },
            },
            {
              trustProfile: {
                is: {
                  verifiedDomain: lookupDomain,
                },
              },
            },
          ],
        },
      });
    })(),
  ]);

  const assessment = assessEmployerTrust({
    email: employer.user.email,
    website: employer.website,
    linkedInCompanyUrl: employer.trustProfile?.linkedInCompanyUrl ?? null,
    approvedBusinessDocs,
    approvedManualReviews,
    openReports,
    postingVelocity24h,
    isPremiumSubscription: subscription?.plan === SubscriptionPlan.EMPLOYER_PREMIUM,
  });

  let riskScore = assessment.riskScore;
  const warnings = [...assessment.warnings];

  if (duplicateCompanyNameMatches > 0) {
    riskScore = Math.min(100, riskScore + 16);
    warnings.push("Another employer account is already using this company name.");
  }

  if (duplicateDomainMatches > 0) {
    riskScore = Math.min(100, riskScore + 24);
    warnings.push("This company domain already appears on another employer account and requires review.");
  }

  const riskLevel = riskLevelForScore(riskScore);
  const postingEligibility = assessment.postingEligibility && riskScore < 55 && duplicateDomainMatches === 0;

  const updated = await prisma.employerTrustProfile.update({
    where: { employerId },
    data: {
      verificationLevel: assessment.verificationLevel,
      authenticityScore: assessment.authenticityScore,
      riskScore,
      riskLevel,
      postingEligibility,
      requiresEnhancedVerification: assessment.requiresEnhancedVerification,
      verifiedDomain: assessment.verifiedDomain,
      websiteMatchesEmail: assessment.websiteMatchesEmail,
      throwawayDomainDetected: assessment.throwawayDomainDetected,
      domainVerifiedAt:
        assessment.verificationLevel !== EmployerVerificationLevel.UNVERIFIED
          ? employer.trustProfile?.domainVerifiedAt ?? new Date()
          : null,
      businessDocVerifiedAt:
        approvedBusinessDocs > 0 ? employer.trustProfile?.businessDocVerifiedAt ?? new Date() : null,
      manualApprovedAt:
        approvedManualReviews > 0 ? employer.trustProfile?.manualApprovedAt ?? new Date() : null,
      premiumTrustedAt:
        assessment.verificationLevel === EmployerVerificationLevel.PREMIUM_TRUSTED
          ? employer.trustProfile?.premiumTrustedAt ?? new Date()
          : null,
      suspiciousSignals: warnings,
    },
  });

  const restriction = restrictionFromRisk(riskLevel);
  await prisma.user.update({
    where: { id: employer.userId },
    data: {
      accountRestrictionStatus: restriction.status,
      accountRestrictionReason: restriction.reason,
      accountRestrictedAt: restriction.status === "ACTIVE" ? null : new Date(),
    },
  });

  return updated;
}

export async function refreshCandidateTrustProfile(userId: string) {
  const existing = await ensureCandidateTrustProfile(userId);

  const [
    user,
    candidateProfile,
    activeResumeCount,
    approvedIdentityDocs,
    approvedCertificationArtifacts,
    approvedEmploymentProofs,
    openReports,
    applicationsLast24h,
    verifiedSkills,
    activePartnerMarkers,
  ] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, emailVerified: true },
      }),
      prisma.candidateProfile.findUnique({
        where: { userId },
        select: {
          profileCompleteness: true,
          skills: true,
          linkedinUrl: true,
          githubUrl: true,
          portfolioUrl: true,
          workHistory: true,
          educationHistory: true,
          certifications: true,
        },
      }),
      prisma.resume.count({
        where: {
          profile: { userId },
          isActive: true,
          securityStatus: "CLEAN",
        },
      }),
      prisma.verificationArtifact.count({
        where: {
          userId,
          type: VerificationArtifactType.IDENTITY_DOCUMENT,
          status: VerificationArtifactStatus.APPROVED,
        },
      }),
      prisma.verificationArtifact.count({
        where: {
          userId,
          type: VerificationArtifactType.CERTIFICATION,
          status: VerificationArtifactStatus.APPROVED,
        },
      }),
      prisma.verificationArtifact.count({
        where: {
          userId,
          type: VerificationArtifactType.EMPLOYMENT_PROOF,
          status: VerificationArtifactStatus.APPROVED,
        },
      }),
      prisma.abuseReport.count({
        where: {
          reportedUserId: userId,
          status: { in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED] },
        },
      }),
      prisma.application.count({
        where: {
          candidateId: userId,
          createdAt: { gte: startOfWindow(24) },
        },
      }),
      prisma.candidateVerifiedSkill.findMany({
        where: {
          userId,
          status: CandidateSkillVerificationStatus.VERIFIED,
        },
        select: {
          method: true,
        },
      }),
      prisma.candidatePartnerMarker.count({
        where: {
          userId,
          status: CandidatePartnerMarkerStatus.ACTIVE,
        },
      }),
    ]);

  if (!user) {
    throw new Error("User not found");
  }

  const workHistoryEntries = countStructuredEntries(candidateProfile?.workHistory, [
    "title",
    "company",
    "period",
    "description",
  ]);
  const educationEvidenceCount = countStructuredEntries(candidateProfile?.educationHistory, [
    "institution",
    "degree",
    "period",
  ]);
  const certificationEntries = countStructuredEntries(candidateProfile?.certifications, [
    "name",
    "issuer",
    "credentialUrl",
  ]);
  const workHistoryConsistent = isWorkHistoryConsistent(candidateProfile?.workHistory);
  const verifiedSkillCount = verifiedSkills.length;
  const assessmentBackedSkillCount = verifiedSkills.filter(
    (skill) => skill.method === CandidateSkillVerificationMethod.ASSESSMENT,
  ).length;
  const certificationEvidenceCount = approvedCertificationArtifacts + certificationEntries;
  const hasResume = activeResumeCount > 0;
  const fullyCompletedProfile =
    (candidateProfile?.profileCompleteness ?? 0) >= 80 &&
    hasResume &&
    workHistoryEntries > 0 &&
    educationEvidenceCount > 0 &&
    ((candidateProfile?.skills.length ?? 0) >= 3 || verifiedSkillCount > 0);

  const assessment = assessCandidateTrust({
    emailVerified: user.emailVerified,
    phoneVerified: Boolean(existing.phoneVerifiedAt),
    identityVerified: approvedIdentityDocs > 0,
    skillsVerified: verifiedSkillCount > 0,
    verifiedSkillCount,
    assessmentBackedSkillCount,
    partnerSignalCount: activePartnerMarkers,
    employmentVerified: approvedEmploymentProofs > 0,
    hasLinkedIn: Boolean(candidateProfile?.linkedinUrl),
    hasGitHub: Boolean(candidateProfile?.githubUrl),
    hasPortfolio: Boolean(candidateProfile?.portfolioUrl),
    hasResume,
    profileCompleteness: candidateProfile?.profileCompleteness ?? 0,
    workHistoryEntries,
    workHistoryConsistent,
    educationEvidenceCount,
    certificationEvidenceCount,
    openReports,
    applicationsLast24h,
  });

  const explainabilitySignals = buildCandidateExplainabilitySignals({
    emailVerified: user.emailVerified,
    phoneVerified: Boolean(existing.phoneVerifiedAt),
    identityVerified: approvedIdentityDocs > 0,
    hasResume,
    profileCompleteness: candidateProfile?.profileCompleteness ?? 0,
    verifiedSkillCount,
    assessmentBackedSkillCount,
    partnerSignalCount: activePartnerMarkers,
    workHistoryEntries,
    workHistoryConsistent,
    educationEvidenceCount,
    certificationEvidenceCount,
    hasLinkedIn: Boolean(candidateProfile?.linkedinUrl),
    hasGitHub: Boolean(candidateProfile?.githubUrl),
    hasPortfolio: Boolean(candidateProfile?.portfolioUrl),
  });

  const updated = await prisma.candidateTrustProfile.update({
    where: { userId },
    data: {
      verificationLevel: assessment.verificationLevel,
      authenticityScore: assessment.authenticityScore,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      identityVerifiedAt:
        approvedIdentityDocs > 0 ? existing.identityVerifiedAt ?? new Date() : null,
      skillsVerifiedAt:
        verifiedSkillCount > 0
          ? existing.skillsVerifiedAt ?? new Date()
          : null,
      employmentVerifiedAt:
        approvedEmploymentProofs > 0 ? existing.employmentVerifiedAt ?? new Date() : null,
      linkedinVerified: Boolean(candidateProfile?.linkedinUrl),
      githubVerified: Boolean(candidateProfile?.githubUrl),
      portfolioVerified: Boolean(candidateProfile?.portfolioUrl),
      premiumFilterEligible: assessment.premiumFilterEligible,
      verifiedSkillCount,
      partnerSignalCount: activePartnerMarkers,
      assessmentBacked: assessmentBackedSkillCount > 0,
      fullyCompletedProfile,
      explainabilitySignals,
      suspiciousSignals: assessment.warnings,
    },
  });

  const restriction = restrictionFromRisk(assessment.riskLevel);
  await prisma.user.update({
    where: { id: userId },
    data: {
      accountRestrictionStatus: restriction.status,
      accountRestrictionReason: restriction.reason,
      accountRestrictedAt: restriction.status === "ACTIVE" ? null : new Date(),
    },
  });

  return updated;
}

export async function recordTrustRiskEvent(input: {
  entityType: TrustEntityType;
  reasonCode: string;
  summary: string;
  scoreDelta: number;
  resultingScore: number;
  riskLevel: TrustRiskLevel;
  userId?: string | null;
  employerId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
  evidence?: Prisma.InputJsonValue;
  autoHeld?: boolean;
}) {
  const event = await prisma.trustRiskEvent.create({
    data: {
      entityType: input.entityType,
      reasonCode: input.reasonCode,
      summary: input.summary,
      scoreDelta: input.scoreDelta,
      resultingScore: input.resultingScore,
      riskLevel: input.riskLevel,
      userId: input.userId ?? null,
      employerId: input.employerId ?? null,
      jobId: input.jobId ?? null,
      applicationId: input.applicationId ?? null,
      threadId: input.threadId ?? null,
      evidence: input.evidence,
      autoHeld: input.autoHeld ?? false,
    },
  });

  if (input.userId) {
    const restriction = restrictionFromRisk(input.riskLevel);
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        accountRestrictionStatus: restriction.status,
        accountRestrictionReason: restriction.reason,
        accountRestrictedAt: restriction.status === "ACTIVE" ? null : new Date(),
      },
    }).catch(() => undefined);
  }

  return event;
}

export async function createTrustCase(input: {
  entityType: TrustEntityType;
  priority: TrustRiskLevel;
  title: string;
  reasonCode?: string | null;
  summary?: string | null;
  employerTrustProfileId?: string | null;
  candidateTrustProfileId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
  reportId?: string | null;
  artifactId?: string | null;
  assignedAdminId?: string | null;
}) {
  return prisma.trustCase.create({
    data: {
      entityType: input.entityType,
      priority: input.priority,
      title: input.title,
      reasonCode: input.reasonCode ?? null,
      summary: input.summary ?? null,
      employerTrustProfileId: input.employerTrustProfileId ?? null,
      candidateTrustProfileId: input.candidateTrustProfileId ?? null,
      jobId: input.jobId ?? null,
      applicationId: input.applicationId ?? null,
      threadId: input.threadId ?? null,
      reportId: input.reportId ?? null,
      artifactId: input.artifactId ?? null,
      assignedAdminId: input.assignedAdminId ?? null,
    },
  });
}

export async function addTrustCaseAction(input: {
  caseId: string;
  actorId?: string | null;
  actionType: ModerationActionType;
  reasonCode?: string | null;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.trustCaseAction.create({
    data: {
      caseId: input.caseId,
      actorId: input.actorId ?? null,
      actionType: input.actionType,
      reasonCode: input.reasonCode ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata,
    },
  });
}

export function employerTrustSummary(
  trustProfile: {
    verificationLevel: EmployerVerificationLevel;
    authenticityScore: number;
    riskScore: number;
    riskLevel: TrustRiskLevel;
    postingEligibility: boolean;
    requiresEnhancedVerification: boolean;
    verifiedDomain: string | null;
    suspiciousSignals?: unknown;
  },
) {
  const warnings = Array.isArray(trustProfile.suspiciousSignals)
    ? trustProfile.suspiciousSignals.filter((item): item is string => typeof item === "string")
    : [];

  return {
    badge: employerBadgeLabel(trustProfile.verificationLevel),
    verificationLevel: trustProfile.verificationLevel,
    authenticityScore: trustProfile.authenticityScore,
    riskScore: trustProfile.riskScore,
    riskLevel: trustProfile.riskLevel,
    postingEligibility: trustProfile.postingEligibility,
    requiresEnhancedVerification: trustProfile.requiresEnhancedVerification,
    verifiedDomain: trustProfile.verifiedDomain,
    warnings,
    checklist: [
      {
        key: "domain",
        label: "Use a real company email and matching website",
        done: trustProfile.verificationLevel !== EmployerVerificationLevel.UNVERIFIED,
      },
      {
        key: "business_doc",
        label: "Upload business registration evidence",
        done: ([
          EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
          EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
          EmployerVerificationLevel.PREMIUM_TRUSTED,
        ] as EmployerVerificationLevel[]).includes(trustProfile.verificationLevel),
      },
      {
        key: "manual_review",
        label: "Complete manual review for higher posting limits",
        done: ([
          EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
          EmployerVerificationLevel.PREMIUM_TRUSTED,
        ] as EmployerVerificationLevel[]).includes(trustProfile.verificationLevel),
      },
    ],
  };
}

export function candidateTrustSummary(
  trustProfile: {
    verificationLevel: CandidateVerificationLevel;
    authenticityScore: number;
    riskScore: number;
    riskLevel: TrustRiskLevel;
    premiumFilterEligible: boolean;
    verifiedSkillCount?: number;
    partnerSignalCount?: number;
    assessmentBacked?: boolean;
    fullyCompletedProfile?: boolean;
    explainabilitySignals?: unknown;
    phoneNumber?: string | null;
    suspiciousSignals?: unknown;
  },
) {
  const warnings = Array.isArray(trustProfile.suspiciousSignals)
    ? trustProfile.suspiciousSignals.filter((item): item is string => typeof item === "string")
    : [];
  const explainability = Array.isArray(trustProfile.explainabilitySignals)
    ? trustProfile.explainabilitySignals.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];

  return {
    badge: candidateBadgeLabel(trustProfile.verificationLevel),
    verificationLevel: trustProfile.verificationLevel,
    authenticityScore: trustProfile.authenticityScore,
    riskScore: trustProfile.riskScore,
    riskLevel: trustProfile.riskLevel,
    premiumFilterEligible: trustProfile.premiumFilterEligible,
    verifiedSkillCount: trustProfile.verifiedSkillCount ?? 0,
    partnerSignalCount: trustProfile.partnerSignalCount ?? 0,
    assessmentBacked: Boolean(trustProfile.assessmentBacked),
    fullyCompletedProfile: Boolean(trustProfile.fullyCompletedProfile),
    explainability,
    maskedPhone: maskPhoneNumber(trustProfile.phoneNumber ?? null),
    warnings,
    checklist: [
      {
        key: "email",
        label: "Verify your email",
        done: trustProfile.verificationLevel !== CandidateVerificationLevel.UNVERIFIED,
      },
      {
        key: "phone",
        label: "Verify your phone number",
        done: ([
          CandidateVerificationLevel.PHONE_VERIFIED,
          CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED,
          CandidateVerificationLevel.SKILLS_VERIFIED,
          CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED,
        ] as CandidateVerificationLevel[]).includes(trustProfile.verificationLevel),
      },
      {
        key: "identity",
        label: "Upload ID or certification evidence",
        done: ([
          CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED,
          CandidateVerificationLevel.SKILLS_VERIFIED,
          CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED,
        ] as CandidateVerificationLevel[]).includes(trustProfile.verificationLevel),
      },
      {
        key: "skills",
        label: "Add at least one verified skill",
        done: (trustProfile.verifiedSkillCount ?? 0) > 0,
      },
      {
        key: "profile",
        label: "Complete the full employer-facing profile",
        done: Boolean(trustProfile.fullyCompletedProfile),
      },
    ],
  };
}

export function jobTrustSummary(input: {
  riskLevel: TrustRiskLevel;
  riskScore: number;
  qualityCheckedAt?: Date | null;
  publishedAt?: Date | null;
  employerCreatedAt?: Date | null;
  employerTrustProfile?: {
    verificationLevel: EmployerVerificationLevel;
    authenticityScore: number;
    riskScore: number;
    riskLevel: TrustRiskLevel;
    postingEligibility: boolean;
    requiresEnhancedVerification: boolean;
    verifiedDomain: string | null;
    suspiciousSignals?: unknown;
  } | null;
}) {
  const employerSummary = input.employerTrustProfile
    ? employerTrustSummary(input.employerTrustProfile)
    : null;
  const isNewEmployer =
    !input.employerTrustProfile ||
    input.employerTrustProfile.verificationLevel === EmployerVerificationLevel.UNVERIFIED;

  return {
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
    jobQualityChecked:
      Boolean(input.qualityCheckedAt) && input.riskLevel !== TrustRiskLevel.HIGH && input.riskLevel !== TrustRiskLevel.CRITICAL,
    companyReviewed: Boolean(
      input.employerTrustProfile &&
      ([
        EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
        EmployerVerificationLevel.PREMIUM_TRUSTED,
      ] as EmployerVerificationLevel[]).includes(input.employerTrustProfile.verificationLevel),
    ),
    newEmployerCaution: isNewEmployer,
    publishedRecently:
      Boolean(input.publishedAt) &&
      input.publishedAt!.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000,
    employer: employerSummary,
    guidance:
      input.riskLevel === TrustRiskLevel.HIGH || input.riskLevel === TrustRiskLevel.CRITICAL
        ? "This job is under additional trust review."
        : isNewEmployer
          ? "This employer is new and still building trust on AfriTalent."
          : "This job has passed AfriTalent trust checks.",
    employerMemberSince: input.employerCreatedAt?.toISOString() ?? null,
  };
}

export function scoreDeltaForReport(reason: AbuseReportReason): number {
  switch (reason) {
    case AbuseReportReason.ADVANCE_FEE_REQUEST:
    case AbuseReportReason.SCAM:
    case AbuseReportReason.IMPERSONATION:
      return 30;
    case AbuseReportReason.FAKE_JOB:
    case AbuseReportReason.FAKE_PROFILE:
    case AbuseReportReason.MISLEADING_SALARY:
      return 20;
    default:
      return 12;
  }
}

export function trustPriorityForReport(reason: AbuseReportReason): TrustRiskLevel {
  switch (reason) {
    case AbuseReportReason.ADVANCE_FEE_REQUEST:
    case AbuseReportReason.SCAM:
    case AbuseReportReason.IMPERSONATION:
      return TrustRiskLevel.HIGH;
    case AbuseReportReason.FAKE_JOB:
    case AbuseReportReason.FAKE_PROFILE:
      return TrustRiskLevel.MEDIUM;
    default:
      return TrustRiskLevel.MEDIUM;
  }
}

export function isPremiumEmployerPlan(plan?: SubscriptionPlan | null): boolean {
  return plan === SubscriptionPlan.EMPLOYER_PREMIUM;
}

export function canUseVerifiedCandidateFilter(plan?: SubscriptionPlan | null, role?: Role): boolean {
  return role === Role.ADMIN || isPremiumEmployerPlan(plan);
}
