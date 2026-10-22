import { fetchAPI, type AccountRestrictionStatus } from "./api";

// Typed client for /api/admin/console (backend/src/routes/admin-console.ts).

export type ConsoleRole = "ADMIN" | "CANDIDATE" | "EMPLOYER";
export type ConsoleJobStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "CLOSED" | "REMOVED";
export type EmployerVerificationLevel =
  | "UNVERIFIED"
  | "EMAIL_DOMAIN_VERIFIED"
  | "BUSINESS_DOC_VERIFIED"
  | "MANUAL_REVIEW_APPROVED"
  | "PREMIUM_TRUSTED";
export type LifecycleAction = "suspend" | "ban" | "reactivate" | "revoke_sessions" | "force_reverify";
export type JobAction = "approve" | "reject" | "close" | "reopen" | "feature" | "unfeature" | "remove";
export type EmailOutcome = "queued" | "skipped_not_configured" | "not_requested";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConsoleOverview {
  users: {
    total: number;
    byRole: Partial<Record<ConsoleRole, number>>;
    byStatus: Partial<Record<AccountRestrictionStatus, number>>;
    newLast7d: number;
  };
  jobs: { total: number; byStatus: Partial<Record<ConsoleJobStatus, number>>; featured: number };
  applications: { last14d: number; perDay: Array<{ date: string; count: number }> };
  queues: {
    pendingJobs: number;
    reviewsPending: number;
    verificationBacklog: number;
    openAbuseReports: number;
    unverifiedEmployers: number;
    supportTicketsOpen: number | null;
  };
  emailDeliveryConfigured: boolean;
  generatedAt: string;
}

export interface ConsoleUser {
  id: string;
  email: string;
  name: string;
  role: ConsoleRole;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerifiedAt: string | null;
  accountRestrictionStatus: AccountRestrictionStatus;
  accountRestrictionReason: string | null;
  accountRestrictedAt: string | null;
  accountRestrictedUntil: string | null;
  sessionsRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employer: {
    id: string;
    companyName: string;
    trustProfile: { verificationLevel: EmployerVerificationLevel; riskLevel: string } | null;
  } | null;
  candidateTrustProfile: { verificationLevel: string; riskLevel: string } | null;
  _count: { applications: number; sentMessages: number };
}

export interface AuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetName?: string | null;
  reason: string | null;
  changes: unknown;
  metadata: unknown;
  status: string;
  createdAt: string;
  admin: { title: string; admin: { id: string; name: string; email: string } } | null;
}

export interface ConsoleUserDetail {
  user: ConsoleUser & {
    preferredLocale: string;
    emailVerifiedAt: string | null;
    phoneNumber: string | null;
    deletionRequestedAt: string | null;
    totpEnrolledAt: string | null;
    candidateProfile: {
      headline: string | null;
      skills: string[];
      targetRoles: string[];
      targetCountries: string[];
      yearsExperience: number | null;
      openToWork: boolean;
      profileCompleteness: number;
    } | null;
    candidateTrustProfile: {
      verificationLevel: string;
      authenticityScore: number;
      riskScore: number;
      riskLevel: string;
      phoneVerifiedAt: string | null;
      identityVerifiedAt: string | null;
      linkedinVerified: boolean;
      githubVerified: boolean;
    } | null;
    employer: {
      id: string;
      companyName: string;
      website: string | null;
      location: string;
      createdAt: string;
      trustProfile: {
        verificationLevel: EmployerVerificationLevel;
        authenticityScore: number;
        riskScore: number;
        riskLevel: string;
        postingEligibility: boolean;
        verifiedDomain: string | null;
        manualApprovedAt: string | null;
      } | null;
      _count: { jobs: number };
    } | null;
    subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
    adminRole: { title: string; permissions: string[]; isActive: boolean } | null;
    _count: {
      applications: number;
      sentMessages: number;
      companyReviews: number;
      savedSearches: number;
      notifications: number;
      abuseReportsAgainst: number;
    };
  };
  applications: Array<{
    id: string;
    status: string;
    createdAt: string;
    job: { id: string; title: string; slug: string; sourceName: string | null; employer: { companyName: string } | null };
  }>;
  jobs: Array<{
    id: string;
    title: string;
    slug: string;
    status: ConsoleJobStatus;
    isFeatured: boolean;
    createdAt: string;
    _count: { applications: number };
  }>;
  trust: { openReportsAgainst: number };
  activity: Array<{ at: string; kind: string; label: string }>;
  auditTrail: AuditEntry[];
}

export interface ConsoleCompany {
  id: string;
  companyName: string;
  website: string | null;
  location: string;
  logoUrl: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string; emailVerified: boolean; accountRestrictionStatus: AccountRestrictionStatus };
  trustProfile: {
    verificationLevel: EmployerVerificationLevel;
    riskLevel: string;
    riskScore: number;
    postingEligibility: boolean;
    verifiedDomain: string | null;
  } | null;
  _count: { jobs: number };
}

export interface ConsoleJob {
  id: string;
  title: string;
  slug: string;
  location: string;
  type: string;
  status: ConsoleJobStatus;
  jobSource: string;
  sourceName: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  featuredAt: string | null;
  closedAt: string | null;
  moderationReason: string | null;
  publishedAt: string | null;
  isExpired: boolean;
  riskLevel: string;
  riskScore: number;
  createdAt: string;
  updatedAt: string;
  employer: { id: string; companyName: string; userId: string } | null;
  _count: { applications: number };
}

export interface BroadcastSegment {
  role?: ConsoleRole;
  status?: AccountRestrictionStatus;
  emailVerified?: boolean;
  userIds?: string[];
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

const BASE = "/api/admin/console";

export const adminConsole = {
  overview: () => fetchAPI<ConsoleOverview>(`${BASE}/overview`),

  users: (params: {
    role?: ConsoleRole | "";
    status?: AccountRestrictionStatus | "";
    emailVerified?: "true" | "false" | "";
    search?: string;
    sort?: "newest" | "oldest" | "name";
    page?: number;
    limit?: number;
  }) => fetchAPI<{ users: ConsoleUser[]; pagination: Pagination }>(`${BASE}/users${qs(params)}`),

  user: (id: string) => fetchAPI<ConsoleUserDetail>(`${BASE}/users/${encodeURIComponent(id)}`),

  lifecycle: (id: string, body: { action: LifecycleAction; reason: string; until?: string | null }) =>
    fetchAPI<{ user: ConsoleUser; action: LifecycleAction }>(`${BASE}/users/${encodeURIComponent(id)}/lifecycle`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  message: (id: string, body: { subject: string; body: string; sendEmail: boolean }) =>
    fetchAPI<{ threadId: string; notificationId: string; email: EmailOutcome }>(
      `${BASE}/users/${encodeURIComponent(id)}/message`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  broadcast: (body: { segment: BroadcastSegment; subject: string; body: string; sendEmail: boolean; dryRun?: boolean }) =>
    fetchAPI<{ recipients: number; email?: EmailOutcome; dryRun?: boolean }>(`${BASE}/messages/broadcast`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  companies: (params: {
    search?: string;
    verificationLevel?: EmployerVerificationLevel | "";
    status?: AccountRestrictionStatus | "";
    page?: number;
    limit?: number;
  }) => fetchAPI<{ companies: ConsoleCompany[]; pagination: Pagination }>(`${BASE}/companies${qs(params)}`),

  setVerification: (employerId: string, body: { level: EmployerVerificationLevel; reason: string }) =>
    fetchAPI<{ employerId: string }>(`${BASE}/companies/${encodeURIComponent(employerId)}/verification`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  jobs: (params: {
    search?: string;
    status?: ConsoleJobStatus | "";
    source?: string;
    featured?: "true" | "false" | "";
    employerId?: string;
    page?: number;
    limit?: number;
  }) => fetchAPI<{ jobs: ConsoleJob[]; pagination: Pagination }>(`${BASE}/jobs${qs(params)}`),

  jobAction: (id: string, body: { action: JobAction; reason: string }) =>
    fetchAPI<{ job: ConsoleJob; action: JobAction }>(`${BASE}/jobs/${encodeURIComponent(id)}/action`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// Typed client for /api/admin/totp (backend/src/routes/admin-totp.ts). These
// routes are exempt from the admin TOTP gate so an un-enrolled admin can
// always reach them.

export interface AdminTotpStatus {
  enrolled: boolean;
  /** "pending" when a secret was generated but never verified. */
  enrolmentStartedAt: "pending" | null;
  graceUntil: string | null;
  isAdmin: true;
}

export interface AdminTotpEnrolment {
  secret: string;
  provisioningUri: string;
  instructions: string;
}

const TOTP_BASE = "/api/admin/totp";

export const adminTotp = {
  status: () => fetchAPI<AdminTotpStatus>(`${TOTP_BASE}/status`),

  enrol: () => fetchAPI<AdminTotpEnrolment>(`${TOTP_BASE}/enrol`, { method: "POST" }),

  verifyEnrolment: (code: string) =>
    fetchAPI<{ enrolled: true; enrolledAt: string }>(`${TOTP_BASE}/verify-enrolment`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  disable: (code: string) =>
    fetchAPI<{ disabled: true }>(`${TOTP_BASE}/disable`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

/** Fired on window after enrolment state changes so the console banner refreshes. */
export const ADMIN_TOTP_CHANGED_EVENT = "afritalent:admin-totp-changed";

export function errorCodeOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

/** True when the admin TOTP gate rejected a request (backend/src/middleware/admin-totp-gate.ts). */
export function isTotpEnrolmentRequired(err: unknown): boolean {
  return errorCodeOf(err) === "TOTP_ENROLMENT_REQUIRED";
}
