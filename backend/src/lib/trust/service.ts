import {
  AbuseReportReason,
  AbuseReportStatus,
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
} from "./risk.js";

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

  const [employer, approvedBusinessDocs, approvedManualReviews, openReports, postingVelocity24h, subscription] =
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
      prisma.subscription.findUnique({
        where: { userId: employerId },
        select: { plan: true },
      }).catch(() => null),
    ]);

  if (!employer) {
    throw new Error("Employer not found");
  }

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

  const updated = await prisma.employerTrustProfile.update({
    where: { employerId },
    data: {
      verificationLevel: assessment.verificationLevel,
      authenticityScore: assessment.authenticityScore,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      postingEligibility: assessment.postingEligibility,
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
      suspiciousSignals: assessment.warnings,
    },
  });

  const restriction = restrictionFromRisk(assessment.riskLevel);
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

  const [user, candidateProfile, approvedIdentityDocs, approvedCertifications, approvedEmploymentProofs, openReports, applicationsLast24h, completedAssessments] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, emailVerified: true },
      }),
      prisma.candidateProfile.findUnique({
        where: { userId },
        select: {
          profileCompleteness: true,
          linkedinUrl: true,
          githubUrl: true,
          portfolioUrl: true,
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
      prisma.skillAssessment.count({
        where: {
          userId,
          status: "COMPLETED",
        } as Prisma.SkillAssessmentWhereInput,
      }),
    ]);

  if (!user) {
    throw new Error("User not found");
  }

  const assessment = assessCandidateTrust({
    emailVerified: user.emailVerified,
    phoneVerified: Boolean(existing.phoneVerifiedAt),
    identityVerified: approvedIdentityDocs > 0,
    skillsVerified: approvedCertifications > 0 || completedAssessments > 0,
    employmentVerified: approvedEmploymentProofs > 0,
    hasLinkedIn: Boolean(candidateProfile?.linkedinUrl),
    hasGitHub: Boolean(candidateProfile?.githubUrl),
    hasPortfolio: Boolean(candidateProfile?.portfolioUrl),
    profileCompleteness: candidateProfile?.profileCompleteness ?? 0,
    openReports,
    applicationsLast24h,
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
        assessment.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        assessment.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? existing.skillsVerifiedAt ?? new Date()
          : null,
      employmentVerifiedAt:
        approvedEmploymentProofs > 0 ? existing.employmentVerifiedAt ?? new Date() : null,
      linkedinVerified: Boolean(candidateProfile?.linkedinUrl),
      githubVerified: Boolean(candidateProfile?.githubUrl),
      portfolioVerified: Boolean(candidateProfile?.portfolioUrl),
      premiumFilterEligible: assessment.premiumFilterEligible,
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
    suspiciousSignals: unknown;
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
        done: [
          EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
          EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
          EmployerVerificationLevel.PREMIUM_TRUSTED,
        ].includes(trustProfile.verificationLevel),
      },
      {
        key: "manual_review",
        label: "Complete manual review for higher posting limits",
        done: [
          EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
          EmployerVerificationLevel.PREMIUM_TRUSTED,
        ].includes(trustProfile.verificationLevel),
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
    phoneNumber?: string | null;
    suspiciousSignals?: unknown;
  },
) {
  const warnings = Array.isArray(trustProfile.suspiciousSignals)
    ? trustProfile.suspiciousSignals.filter((item): item is string => typeof item === "string")
    : [];

  return {
    badge: candidateBadgeLabel(trustProfile.verificationLevel),
    verificationLevel: trustProfile.verificationLevel,
    authenticityScore: trustProfile.authenticityScore,
    riskScore: trustProfile.riskScore,
    riskLevel: trustProfile.riskLevel,
    premiumFilterEligible: trustProfile.premiumFilterEligible,
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
        done: [
          CandidateVerificationLevel.PHONE_VERIFIED,
          CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED,
          CandidateVerificationLevel.SKILLS_VERIFIED,
          CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED,
        ].includes(trustProfile.verificationLevel),
      },
      {
        key: "identity",
        label: "Upload ID or certification evidence",
        done: [
          CandidateVerificationLevel.IDENTITY_DOCUMENT_VERIFIED,
          CandidateVerificationLevel.SKILLS_VERIFIED,
          CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED,
        ].includes(trustProfile.verificationLevel),
      },
    ],
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
