const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface FetchOptions extends RequestInit {
  token?: string;
}

interface AuthSessionResponse {
  authenticated: boolean;
  user: User | null;
}

interface BotShieldPayload {
  website: string;
  startedAt: number;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // If a token is explicitly provided (API clients, tests), send as Bearer.
  // Browser clients authenticate via HttpOnly cookie (credentials: "include").
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
    credentials: "include", // send HttpOnly cookie on every request
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

async function fetchMultipartAPI<T>(endpoint: string, options: Omit<FetchOptions, "body"> & { body: FormData }): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
    body: options.body,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Auth
export const auth = {
  login: (email: string, password: string, options?: { botShield?: BotShieldPayload }) =>
    fetchAPI<{ user: User; expiresIn: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, botShield: options?.botShield }),
    }),

  register: (data: RegisterData, options?: { botShield?: BotShieldPayload }) =>
    fetchAPI<{ user: User; expiresIn: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...data, botShield: options?.botShield }),
    }),

  me: async (token?: string) => {
    const session = await fetchAPI<AuthSessionResponse>("/api/auth/me", { token });
    return session.user;
  },

  logout: () =>
    fetchAPI<{ message: string }>("/api/auth/logout", { method: "POST" }),
};

// Email verification
export const emailVerification = {
  status: () =>
    fetchAPI<{ email: string; verified: boolean; verifiedAt: string | null }>("/api/auth/email/status"),
  send: () =>
    fetchAPI<{ message: string }>("/api/auth/email/send-verification", { method: "POST" }),
  verify: (token: string) =>
    fetchAPI<{ message: string }>("/api/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
};

// Public marketing stats
export const publicStats = {
  get: () => fetchAPI<PublicStats>("/api/public/stats"),
};

// Jobs
export const jobs = {
  list: (params?: JobListParams) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.location) searchParams.set("location", params.location);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.seniority) searchParams.set("seniority", params.seniority);
    if (params?.visaSponsorship) searchParams.set("visaSponsorship", params.visaSponsorship);
    if (params?.relocationAssistance) searchParams.set("relocationAssistance", params.relocationAssistance);
    if (params?.remote) searchParams.set("remote", params.remote);
    if (params?.salaryMin) searchParams.set("salaryMin", params.salaryMin.toString());
    if (params?.salaryMax) searchParams.set("salaryMax", params.salaryMax.toString());
    if (params?.country) searchParams.set("country", params.country);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    return fetchAPI<JobListResponse>(`/api/jobs${query ? `?${query}` : ""}`);
  },

  get: (slug: string) =>
    fetchAPI<Job>(`/api/jobs/${slug}`),

  create: (data: CreateJobData, token?: string) =>
    fetchAPI<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  myJobs: (token?: string) =>
    fetchAPI<Job[]>("/api/jobs/employer/my-jobs", { token }),
};

// Applications
export const applications = {
  apply: (data: { jobId: string; cvUrl?: string; coverLetter?: string }, token?: string) =>
    fetchAPI<Application>("/api/applications", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  my: (token?: string) =>
    fetchAPI<Application[]>("/api/applications/my", { token }),

  forJob: (jobId: string, token?: string) =>
    fetchAPI<Application[]>(`/api/applications/job/${jobId}`, { token }),

  updateStatus: (id: string, data: { status: string; notes?: string }, token?: string) =>
    fetchAPI<Application>(`/api/applications/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),
};

// Resources
export const resources = {
  list: (params?: { category?: string; search?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    return fetchAPI<ResourceListResponse>(`/api/resources${query ? `?${query}` : ""}`);
  },

  get: (slug: string) =>
    fetchAPI<Resource>(`/api/resources/${slug}`),

  categories: () =>
    fetchAPI<string[]>("/api/resources/categories"),
};

// Admin
export const admin = {
  stats: (token?: string) =>
    fetchAPI<AdminStats>("/api/admin/stats", { token }),

  pendingJobs: (token?: string) =>
    fetchAPI<Job[]>("/api/admin/jobs/pending", { token }),

  reviewJob: (id: string, data: { status: "APPROVED" | "REJECTED"; notes?: string }, token?: string) =>
    fetchAPI<Job>(`/api/admin/jobs/${id}/review`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),

  users: (token?: string, params?: { role?: string; status?: string; search?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.role) searchParams.set("role", params.role);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());

    const query = searchParams.toString();
    return fetchAPI<UserListResponse>(`/api/admin/users${query ? `?${query}` : ""}`, { token });
  },

  user: (id: string, token?: string) =>
    fetchAPI<AdminUserDetailResponse>(`/api/admin/users/${id}`, { token }),

  updateUserRole: (
    id: string,
    data: {
      role: User["role"];
      permissions?: AdminPermission[];
      adminTitle?: string;
      adminDescription?: string;
      adminRoleActive?: boolean;
      reason?: string;
    },
    token?: string
  ) =>
    fetchAPI<{ user: AdminUserListItem }>(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),

  updateUserStatus: (
    id: string,
    data: { status: AccountRestrictionStatus; reason?: string },
    token?: string
  ) =>
    fetchAPI<{ user: AdminUserListItem }>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
      token,
    }),
};

export const adminBlog = {
  list: (params?: { status?: "pending" | "published" | "all"; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return fetchAPI<{ posts: BlogPost[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/admin/blog${query ? `?${query}` : ""}`
    );
  },
  get: (id: string) => fetchAPI<BlogPost & { wordCount: number }>(`/api/admin/blog/${id}`),
  approve: (id: string) =>
    fetchAPI<{ success: boolean }>(`/api/admin/blog/${id}/approve`, { method: "PUT" }),
  reject: (id: string, notes: string) =>
    fetchAPI<{ success: boolean }>(`/api/admin/blog/${id}/reject`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),
  trigger: () =>
    fetchAPI<{ success: boolean; message: string }>("/api/admin/blog/trigger", { method: "POST" }),
};

export const adminTrust = {
  dashboard: () => fetchAPI<AdminTrustDashboard>("/api/admin/trust/dashboard"),
  verificationQueue: (params?: { subject?: "ALL" | "EMPLOYER" | "CANDIDATE"; status?: "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO" }) => {
    const searchParams = new URLSearchParams();
    if (params?.subject) searchParams.set("subject", params.subject);
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    return fetchAPI<{ queue: AdminVerificationQueueItem[] }>(`/api/admin/trust/verification-queue${query ? `?${query}` : ""}`);
  },
  reviewArtifact: (id: string, data: { status: "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO"; reasonCode: string; reviewerNotes?: string }) =>
    fetchAPI<{ artifact: VerificationArtifactItem; caseId: string }>(`/api/admin/trust/artifacts/${id}/review`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  riskQueue: (params?: { status?: "ALL" | "ACTIVE" }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    return fetchAPI<{ queue: AdminTrustCase[] }>(`/api/admin/trust/risk-queue${query ? `?${query}` : ""}`);
  },
  caseAction: (id: string, data: {
    actionType: "NOTE" | "APPROVE" | "REJECT" | "HOLD" | "LIMIT" | "SUSPEND" | "REINSTATE" | "ESCALATE";
    reasonCode: string;
    notes?: string;
    status?: "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
    priority?: TrustRiskLevel;
  }) =>
    fetchAPI<{ trustCase: AdminTrustCase; action: AdminTrustCaseAction }>(`/api/admin/trust/cases/${id}/actions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  reports: (params?: { status?: "ALL" | "ACTIVE" | "OPEN" | "TRIAGED" | "RESOLVED" | "DISMISSED" }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString();
    return fetchAPI<{ reports: AdminAbuseReport[] }>(`/api/admin/trust/reports${query ? `?${query}` : ""}`);
  },
  reportAction: (id: string, data: {
    status: "TRIAGED" | "RESOLVED" | "DISMISSED";
    reasonCode: string;
    notes?: string;
    actionType?: "NOTE" | "APPROVE" | "REJECT" | "HOLD" | "LIMIT" | "SUSPEND" | "REINSTATE" | "ESCALATE";
  }) =>
    fetchAPI<{ report: AdminAbuseReport }>(`/api/admin/trust/reports/${id}/action`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const adminBilling = {
  dashboard: () => fetchAPI<AdminBillingDashboard>("/api/admin/billing/dashboard"),
  discrepancies: (params?: { status?: "ALL" | "OPEN" | "ACKNOWLEDGED" | "RESOLVED"; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return fetchAPI<{ discrepancies: AdminBillingDiscrepancy[] }>(`/api/admin/billing/discrepancies${query ? `?${query}` : ""}`);
  },
  reconciliationRuns: (limit = 20) =>
    fetchAPI<{ runs: AdminBillingReconciliationRun[] }>(`/api/admin/billing/reconciliation-runs?limit=${limit}`),
  triggerReconciliation: () =>
    fetchAPI<{ result: AdminBillingReconciliationRun }>("/api/admin/billing/reconcile", {
      method: "POST",
    }),
  searchCustomers: (query: string) =>
    fetchAPI<{ customers: AdminBillingCustomerSearchResult[] }>(`/api/admin/billing/customers/search?query=${encodeURIComponent(query)}`),
  customer: (userId: string) =>
    fetchAPI<{ customer: AdminBillingCustomerDetail; planEntitlements: PlanEntitlements[] }>(`/api/admin/billing/customers/${userId}`),
  resyncEntitlements: (userId: string) =>
    fetchAPI<{
      state: BillingEntitlementState;
      validation: BillingEntitlementValidation;
      action: BillingSupportActionRecord;
    }>(`/api/admin/billing/customers/${userId}/resync-entitlements`, {
      method: "POST",
    }),
  updateSubscriptionAccess: (
    userId: string,
    data: {
      plan: BillingStatus["plan"];
      status: BillingStatus["status"];
      currentPeriodEnd?: string | null;
      reasonCode: string;
      notes?: string;
    },
  ) =>
    fetchAPI<{
      subscription: AdminBillingCustomerDetail["subscription"];
      state: BillingEntitlementState;
      validation: BillingEntitlementValidation;
      action: BillingSupportActionRecord;
      warnings: string[];
    }>(`/api/admin/billing/customers/${userId}/subscription-access`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCapabilityAccess: (
    userId: string,
    data: {
      capability: "CANDIDATE_PREMIUM" | "CANDIDATE_AI" | "EMPLOYER_PREMIUM";
      action: "GRANT" | "REVOKE";
      reasonCode: string;
      notes?: string;
    },
  ) =>
    fetchAPI<{
      subscription: AdminBillingCustomerDetail["subscription"];
      state: BillingEntitlementState;
      validation: BillingEntitlementValidation;
      action: BillingSupportActionRecord;
      warnings: string[];
    }>(`/api/admin/billing/customers/${userId}/capability-access`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  supportAction: (
    userId: string,
    data: {
      actionType: "NOTE" | "RESYNC_ENTITLEMENTS" | "RESEND_RECEIPT" | "REFUND_REVIEW" | "CANCEL_SUBSCRIPTION" | "UPGRADE_DOWNGRADE_CORRECTION" | "GRANDFATHER_OVERRIDE";
      reasonCode: string;
      notes?: string;
      billingEventId?: string;
      discrepancyId?: string;
      invoiceId?: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ) =>
    fetchAPI<{
      action: BillingSupportActionRecord;
      receiptDelivery: {
        attempted: boolean;
        delivered: boolean;
        message: string;
      } | null;
    }>(`/api/admin/billing/customers/${userId}/actions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Billing
export const billing = {
  checkout: (plan: string, interval: "MONTHLY" | "YEARLY" = "MONTHLY") =>
    fetchAPI<{
      provider: "STRIPE" | "FLUTTERWAVE";
      url: string;
      sessionId: string;
      reference?: string;
      currency: string;
      amount: number | null;
    }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, interval }),
    }),

  verifyCheckout: (payload: {
    provider: "STRIPE" | "FLUTTERWAVE";
    sessionId?: string;
    transactionId?: number;
    txRef?: string;
  }) =>
    fetchAPI<{
      verified: boolean;
      provider: "STRIPE" | "FLUTTERWAVE";
      plan: BillingStatus["plan"];
      status: BillingStatus["status"];
    }>("/api/billing/verify-checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  portal: () =>
    fetchAPI<{ url: string }>("/api/billing/portal", { method: "POST" }),

  status: () =>
    fetchAPI<BillingStatus>("/api/billing/status"),
};

// Pricing (public + authenticated)
export const pricing = {
  get: (region?: string, currency?: string) => {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (currency) params.set("currency", currency);
    const query = params.toString();
    return fetchAPI<PricingData>(`/api/pricing${query ? `?${query}` : ""}`);
  },

  me: () => fetchAPI<UserPricingData>("/api/pricing/me"),

  setBillingCountry: (country: string, currency?: string, taxIdType?: string, taxIdValue?: string) =>
    fetchAPI<{ region: string; country: string; currency: string }>("/api/pricing/billing-country", {
      method: "POST",
      body: JSON.stringify({ country, currency, taxIdType, taxIdValue }),
    }),

  regions: () => fetchAPI<RegionConfig[]>("/api/pricing/regions"),
  paymentLocalization: () => fetchAPI<PaymentLocalizationResponse>("/api/pricing/payment-localization"),

  entitlements: (plan: string) => fetchAPI<PlanEntitlements>(`/api/pricing/entitlements/${plan}`),
};

export const files = {
  presign: (data: {
    scope: "resume" | "candidate-verification" | "employer-verification";
    contentType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    fileName: string;
    fileSizeBytes: number;
  }) =>
    fetchAPI<{
      presignedUrl: string;
      s3Key: string;
      expiresIn: number;
      method: "PUT";
      headers: {
        "Content-Type": string;
      };
    }>("/api/files/presign", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Talent
export const talent = {
  search: (params?: {
    query?: string;
    skills?: string;
    location?: string;
    minExperience?: number;
    page?: number;
    verifiedOnly?: boolean;
    verifiedSkillsOnly?: boolean;
    fullyCompletedOnly?: boolean;
    assessmentBackedOnly?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set("query", params.query);
    if (params?.skills) searchParams.set("skills", params.skills);
    if (params?.location) searchParams.set("location", params.location);
    if (params?.minExperience) searchParams.set("minExperience", params.minExperience.toString());
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.verifiedOnly) searchParams.set("verifiedOnly", "true");
    if (params?.verifiedSkillsOnly) searchParams.set("verifiedSkillsOnly", "true");
    if (params?.fullyCompletedOnly) searchParams.set("fullyCompletedOnly", "true");
    if (params?.assessmentBackedOnly) searchParams.set("assessmentBackedOnly", "true");
    const query = searchParams.toString();
    return fetchAPI<TalentSearchResponse>(`/api/talent${query ? `?${query}` : ""}`);
  },
  compare: (params: { candidateIds: string[]; query?: string; location?: string; minExperience?: number; skills?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("candidateIds", params.candidateIds.join(","));
    if (params.query) searchParams.set("query", params.query);
    if (params.location) searchParams.set("location", params.location);
    if (params.minExperience != null) searchParams.set("minExperience", params.minExperience.toString());
    if (params.skills) searchParams.set("skills", params.skills);
    return fetchAPI<TalentComparisonResponse>(`/api/talent/compare?${searchParams.toString()}`);
  },
  listPools: () => fetchAPI<{ pools: TalentPool[] }>("/api/talent/pools"),
  createPool: (data: { name: string; description?: string }) =>
    fetchAPI<{ pool: TalentPool }>("/api/talent/pools", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  addCandidateToPool: (poolId: string, data: {
    candidateUserId: string;
    stage?: string;
    notes?: string;
    semanticScore?: number;
    trustScoreSnapshot?: number;
    mobilityScoreSnapshot?: number;
  }) =>
    fetchAPI<{ membership: TalentPoolMembership & { pool: { id: string; name: string } } }>(`/api/talent/pools/${poolId}/candidates`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePoolCandidate: (poolId: string, candidateUserId: string, data: { stage?: string; notes?: string }) =>
    fetchAPI<{ membership: TalentPoolMembership & { pool: { id: string; name: string } } }>(`/api/talent/pools/${poolId}/candidates/${candidateUserId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  removeCandidateFromPool: (poolId: string, candidateUserId: string) =>
    fetchAPI<void>(`/api/talent/pools/${poolId}/candidates/${candidateUserId}`, {
      method: "DELETE",
    }),
  get: (userId: string) => fetchAPI<TalentProfile>(`/api/talent/${userId}`),
};

export const trust = {
  employerSummary: () => fetchAPI<EmployerTrustDashboard>("/api/trust/employer/summary"),
  updateEmployerProfile: (data: { website?: string; linkedInCompanyUrl?: string }) =>
    fetchAPI<{ trust: EmployerTrustSummary; linkedInCompanyUrl?: string | null }>("/api/trust/employer/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  submitEmployerArtifact: (data: {
    type: "BUSINESS_REGISTRATION" | "DOMAIN_OWNERSHIP" | "LINKEDIN_COMPANY";
    fileKey?: string;
    fileName?: string;
    externalUrl?: string;
    metadata?: Record<string, unknown>;
  }) =>
    fetchAPI<{ artifact: VerificationArtifactItem; trust: EmployerTrustSummary; caseId: string }>("/api/trust/employer/artifacts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  candidateSummary: () => fetchAPI<CandidateTrustDashboard>("/api/trust/candidate/summary"),
  requestPhoneOtp: (phoneNumber: string) =>
    fetchAPI<{ message: string; expiresAt: string; previewCode?: string }>("/api/trust/candidate/phone/request-otp", {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    }),
  verifyPhoneOtp: (phoneNumber: string, code: string) =>
    fetchAPI<{ message: string; trust: CandidateTrustSummary }>("/api/trust/candidate/phone/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phoneNumber, code }),
    }),
  submitCandidateArtifact: (data: {
    type: "IDENTITY_DOCUMENT" | "CERTIFICATION" | "EMPLOYMENT_PROOF";
    fileKey?: string;
    fileName?: string;
    externalUrl?: string;
    metadata?: Record<string, unknown>;
  }) =>
    fetchAPI<{ artifact: VerificationArtifactItem; trust: CandidateTrustSummary; caseId: string }>("/api/trust/candidate/artifacts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  submitCandidateSkillVerification: (data: {
    skillName: string;
    method: "CERTIFICATE" | "PORTFOLIO" | "ASSESSMENT";
    evidenceLabel?: string;
    fileKey?: string;
    fileName?: string;
    externalUrl?: string;
    assessmentId?: string;
    metadata?: Record<string, unknown>;
  }) =>
    fetchAPI<{
      skillVerification: CandidateVerifiedSkillItem;
      trust: CandidateTrustSummary;
      caseId: string | null;
    }>("/api/trust/candidate/skills", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  reportAbuse: (data: AbuseReportInput) =>
    fetchAPI<{ reportId: string; caseId: string; message: string }>("/api/trust/reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  messagingGuidance: () =>
    fetchAPI<{
      headline: string;
      tips: string[];
      rulePreview: {
        riskScore: number;
        blockedPatterns: string[];
      };
    }>("/api/trust/messaging-guidance"),
};

// Employer Analytics
export const employerAnalytics = {
  stats: () => fetchAPI<EmployerAnalytics>("/api/employer/analytics"),
  advanced: () => fetchAPI<EmployerAdvancedAnalytics>("/api/employer/analytics/advanced"),
  onboarding: () => fetchAPI<EmployerOnboarding>("/api/employer/onboarding"),
  updateOnboarding: (data: EmployerOnboardingUpdateInput) =>
    fetchAPI<{ message: string; onboardingState: EmployerOnboardingStateSnapshot }>("/api/employer/onboarding", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  jobPreview: (data: EmployerJobPreviewInput) =>
    fetchAPI<EmployerJobPreview>("/api/employer/onboarding/job-preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getBranding: () => fetchAPI<EmployerBranding>("/api/employer/branding"),
  updateBranding: (data: {
    companyName?: string;
    website?: string;
    location?: string;
    bio?: string;
    logoUrl?: string;
    brandColor?: string;
    accentColor?: string;
  }) =>
    fetchAPI<EmployerBranding>("/api/employer/branding", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export const adminPartners = {
  list: () => fetchAPI<{ partners: AdminPartnerSummary[] }>("/api/university-partners/admin/partners"),
  create: (data: {
    externalId: string;
    name: string;
    organizationType: PartnerOrganizationType;
    country: string;
    website?: string;
    apiKey: string;
  }) =>
    fetchAPI<{
      partner: AdminPartnerSummary;
      keyAccepted: boolean;
    }>("/api/university-partners/admin/partners", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  detail: (partnerId: string) =>
    fetchAPI<AdminPartnerDetail>(`/api/university-partners/admin/partners/${partnerId}/records`),
  issueMarker: (
    partnerId: string,
    data: {
      userId: string;
      markerType: CandidatePartnerMarkerType;
      partnerRecordId?: string;
      label?: string;
      description?: string;
      expiresAt?: string;
      metadata?: Record<string, unknown>;
    },
  ) =>
    fetchAPI<{ marker: AdminIssuedPartnerMarker }>(`/api/university-partners/admin/partners/${partnerId}/markers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  issueVerifiedSkill: (
    partnerId: string,
    data: {
      userId: string;
      skillName: string;
      method: "PARTNER_ISSUED" | "MANUAL_REVIEW";
      partnerRecordId?: string;
      evidenceLabel?: string;
      evidenceUrl?: string;
      score?: number;
      confidenceNote?: string;
      expiresAt?: string;
      metadata?: Record<string, unknown>;
    },
  ) =>
    fetchAPI<{ skill: AdminIssuedPartnerSkill }>(`/api/university-partners/admin/partners/${partnerId}/verified-skills`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const ats = {
  dashboard: () => fetchAPI<EmployerAtsDashboard>("/api/ats/dashboard"),
  listConnections: () => fetchAPI<ATSConnection[]>("/api/ats/connections"),
  createConnection: (data: {
    provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
    externalOrgId: string;
    displayName?: string;
    accessToken?: string;
    refreshToken?: string;
    webhookSecret?: string;
    webhookSyncEnabled?: boolean;
    twoWaySyncEnabled?: boolean;
    metadata?: Record<string, unknown>;
  }) => fetchAPI<ATSConnection>("/api/ats/connections", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  updateConnection: (id: string, data: {
    externalOrgId?: string;
    displayName?: string;
    accessToken?: string;
    refreshToken?: string;
    webhookSecret?: string;
    clearAccessToken?: boolean;
    clearRefreshToken?: boolean;
    clearWebhookSecret?: boolean;
    webhookSyncEnabled?: boolean;
    twoWaySyncEnabled?: boolean;
    metadata?: Record<string, unknown>;
  }) => fetchAPI<ATSConnection>(`/api/ats/connections/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  testConnection: (id: string) =>
    fetchAPI<{
      ok: boolean;
      healthStatus: ATSHealthStatus;
      sampleJobCount: number;
      warnings: string[];
      capabilities: ATSCapabilityState;
      connection: ATSConnection | null;
    }>(`/api/ats/connections/${id}/test`, {
      method: "POST",
    }),
  connectionLogs: (id: string) =>
    fetchAPI<ATSConnectionLogs>(`/api/ats/connections/${id}/logs`),
  disconnectConnection: (id: string) =>
    fetchAPI<{ message: string }>(`/api/ats/connections/${id}`, {
      method: "DELETE",
    }),
  syncConnection: (id: string) =>
    fetchAPI<ATSSyncRunResult>(`/api/ats/connections/${id}/sync`, {
      method: "POST",
    }),
  retryConnection: (id: string) =>
    fetchAPI<ATSSyncRunResult>(`/api/ats/connections/${id}/retry`, {
      method: "POST",
    }),
};

export const adminAts = {
  dashboard: () => fetchAPI<AdminAtsDashboard>("/api/admin/ats/dashboard"),
};

export const mockInterviews = {
  list: () => fetchAPI<MockInterviewSession[]>("/api/mock-interviews"),
  create: (data: {
    title: string;
    targetRole: string;
    promptLanguage?: "EN" | "ES" | "FR" | "PT" | "AR";
    questionSet?: string[];
    visibility?: "PRIVATE" | "TEAM_SHARED";
    retentionDays?: number;
  }) => fetchAPI<MockInterviewSession>("/api/mock-interviews", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  get: (id: string) => fetchAPI<MockInterviewSession>(`/api/mock-interviews/${id}`),
  submitFeedback: (
    id: string,
    data: {
      transcript: Array<{ speaker: "interviewer" | "candidate"; text: string; timestampMs?: number }>;
      scoreCommunication?: number;
      scoreTechnical?: number;
      scoreProblemSolving?: number;
      notes?: string[];
    },
  ) =>
    fetchAPI<MockInterviewSession>(`/api/mock-interviews/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  submitAnswer: (id: string, data: { question: string; answer: string }) =>
    fetchAPI<{
      score: number;
      feedback: string;
      suggestedAnswer: string;
      talkingPoints: string[];
      strengths: string[];
      improvements: string[];
      source: "ai" | "heuristic";
    }>(`/api/mock-interviews/${id}/submit-answer`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePrivacy: (
    id: string,
    data: {
      visibility?: "PRIVATE" | "TEAM_SHARED";
      retentionDays?: number;
      piiRedacted?: boolean;
      status?: "DRAFT" | "PROCESSING" | "READY" | "ARCHIVED";
    },
  ) =>
    fetchAPI<MockInterviewSession>(`/api/mock-interviews/${id}/privacy`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  addArtifact: (
    id: string,
    data: {
      type: "VIDEO" | "AUDIO" | "TRANSCRIPT" | "FEEDBACK_JSON";
      storageKey: string;
      contentType?: string;
      sizeBytes?: number;
      metadata?: Record<string, unknown>;
    },
  ) =>
    fetchAPI<MockInterviewArtifact>(`/api/mock-interviews/${id}/artifacts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const analyticsEventsApi = {
  ingest: (events: Array<{
    category: "ACQUISITION" | "ACTIVATION" | "ENGAGEMENT" | "CONVERSION" | "RETENTION" | "MONETIZATION" | "EMPLOYER_PIPELINE" | "SYSTEM";
    eventName: string;
    sessionId?: string;
    path?: string;
    referrer?: string;
    properties?: Record<string, unknown>;
    occurredAt?: string;
  }>) =>
    fetchAPI<{ accepted: number }>("/api/analytics/events", {
      method: "POST",
      body: JSON.stringify({ events }),
    }),
  model: () => fetchAPI<Record<string, unknown>>("/api/analytics/model"),
};

// Messages
export const messages = {
  threads: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return fetchAPI<ThreadListResponse>(`/api/messages/threads${query ? `?${query}` : ""}`);
  },

  thread: (id: string, params?: { page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    const query = searchParams.toString();
    return fetchAPI<ThreadDetailResponse>(`/api/messages/threads/${id}${query ? `?${query}` : ""}`);
  },

  createThread: (data: { participantId: string; message: string; applicationId?: string; jobId?: string }) =>
    fetchAPI<MessageThread>("/api/messages/threads", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sendMessage: (threadId: string, body: string) =>
    fetchAPI<Message>(`/api/messages/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  unreadCount: () =>
    fetchAPI<{ count: number }>("/api/messages/unread-count"),
};

// Password Reset
export const passwordReset = {
  forgotPassword: (email: string) =>
    fetchAPI<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    fetchAPI<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};

// Types
export type TrustRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EmployerVerificationLevel =
  | "UNVERIFIED"
  | "EMAIL_DOMAIN_VERIFIED"
  | "BUSINESS_DOC_VERIFIED"
  | "MANUAL_REVIEW_APPROVED"
  | "PREMIUM_TRUSTED";
export type CandidateVerificationLevel =
  | "UNVERIFIED"
  | "EMAIL_VERIFIED"
  | "PHONE_VERIFIED"
  | "IDENTITY_DOCUMENT_VERIFIED"
  | "SKILLS_VERIFIED"
  | "EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED";
export type PartnerOrganizationType =
  | "UNIVERSITY"
  | "BOOTCAMP"
  | "TRAINING_INSTITUTE"
  | "SCHOLARSHIP_PARTNER";
export type CandidateSkillVerificationMethod =
  | "CERTIFICATE"
  | "PORTFOLIO"
  | "ASSESSMENT"
  | "MANUAL_REVIEW"
  | "PARTNER_ISSUED";
export type CandidateSkillVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";
export type CandidatePartnerMarkerType =
  | "UNIVERSITY_VERIFIED"
  | "BOOTCAMP_VERIFIED"
  | "TRAINING_VERIFIED"
  | "SCHOLARSHIP_ALUMNI"
  | "SCHOLARSHIP_FELLOW"
  | "PARTNER_RECOMMENDED";
export type CandidatePartnerMarkerStatus =
  | "PENDING"
  | "ACTIVE"
  | "REVOKED"
  | "EXPIRED";

export interface TrustChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface EmployerTrustSummary {
  badge: string;
  verificationLevel: EmployerVerificationLevel;
  authenticityScore: number;
  riskScore: number;
  riskLevel: TrustRiskLevel;
  postingEligibility: boolean;
  requiresEnhancedVerification: boolean;
  verifiedDomain: string | null;
  warnings: string[];
  checklist: TrustChecklistItem[];
}

export interface CandidateTrustSummary {
  badge: string;
  verificationLevel: CandidateVerificationLevel;
  authenticityScore: number;
  riskScore: number;
  riskLevel: TrustRiskLevel;
  premiumFilterEligible: boolean;
  verifiedSkillCount: number;
  partnerSignalCount: number;
  assessmentBacked: boolean;
  fullyCompletedProfile: boolean;
  explainability: CandidateTrustExplainabilityItem[];
  maskedPhone: string | null;
  warnings: string[];
  checklist: TrustChecklistItem[];
}

export interface CandidateTrustExplainabilityItem {
  key: string;
  label: string;
  status: "verified" | "strengthening" | "needs_attention";
  detail: string;
}

export interface CandidateVerifiedSkillItem {
  id: string;
  skillName: string;
  method: CandidateSkillVerificationMethod;
  status: CandidateSkillVerificationStatus;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  score: number | null;
  confidenceNote: string | null;
  verifiedAt: string | null;
  createdAt: string;
  partner: {
    id: string;
    name: string;
    organizationType: PartnerOrganizationType;
  } | null;
}

export interface CandidatePartnerMarkerItem {
  id: string;
  markerType: CandidatePartnerMarkerType;
  status: CandidatePartnerMarkerStatus;
  label: string;
  description: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  partner: {
    id: string;
    name: string;
    country: string;
    organizationType: PartnerOrganizationType;
  };
}

export interface CandidateWorkHistoryItem {
  company: string | null;
  title: string | null;
  period: string | null;
  description: string | null;
}

export interface CandidateEducationItem {
  institution: string | null;
  degree: string | null;
  period: string | null;
}

export interface CandidateCertificationItem {
  name: string | null;
  issuer: string | null;
  credentialUrl: string | null;
}

export interface JobTrustSummary {
  riskLevel: TrustRiskLevel;
  riskScore: number;
  jobQualityChecked: boolean;
  companyReviewed: boolean;
  newEmployerCaution: boolean;
  publishedRecently: boolean;
  guidance: string;
  employerMemberSince: string | null;
  employer: EmployerTrustSummary | null;
}

export interface JobSourceLineageItem {
  source: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
  company: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
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

export interface JobDiscoverySummary {
  qualityScore: number;
  freshnessScore: number;
  applicationLikelihoodScore: number;
  trustedJob: boolean;
  stale: boolean;
  freshnessLabel: "FRESH" | "RECENT" | "ACTIVE" | "AGING" | "STALE" | "EXPIRED";
  qualityLabel: "TRUSTED" | "SOLID" | "REVIEW" | "THIN";
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

export interface VerificationArtifactItem {
  id: string;
  type: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO";
  fileName: string | null;
  externalUrl: string | null;
  reviewerNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface EmployerTrustDashboard {
  employer: {
    id: string;
    companyName: string;
    website: string | null;
    location: string;
    bio: string | null;
    email: string;
    emailVerified: boolean;
  };
  trust: EmployerTrustSummary;
  linkedInCompanyUrl?: string | null;
  artifacts: VerificationArtifactItem[];
  recentJobs: Array<{
    id: string;
    title: string;
    status: string;
    riskLevel: TrustRiskLevel;
    createdAt: string;
  }>;
}

export interface CandidateTrustDashboard {
  profile: {
    headline: string | null;
    bio: string | null;
    skills: string[];
    targetRoles: string[];
    targetCountries: string[];
    yearsExperience: number | null;
    visaStatus: string | null;
    openToWork: boolean;
    profileCompleteness: number;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
    workHistory: CandidateWorkHistoryItem[] | null;
    educationHistory: CandidateEducationItem[] | null;
    certifications: CandidateCertificationItem[] | null;
  } | null;
  trust: CandidateTrustSummary;
  artifacts: VerificationArtifactItem[];
  skillVerifications: CandidateVerifiedSkillItem[];
  partnerMarkers: CandidatePartnerMarkerItem[];
  assessments: SkillAssessmentItem[];
}

export interface AdminTrustDashboard {
  pendingVerificationArtifacts: number;
  openRiskCases: number;
  openReports: number;
  limitedAccounts: number;
  suspendedAccounts: number;
  heldJobs: number;
}

export interface AdminTrustCaseAction {
  id: string;
  actionType: string;
  reasonCode: string | null;
  notes: string | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

export interface AdminVerificationQueueItem extends VerificationArtifactItem {
  user?: { id: string; name: string; email: string } | null;
  employer?: { id: string; companyName: string; userId: string } | null;
  reviewer?: { id: string; name: string } | null;
  trustCase?: {
    id: string;
    actions: AdminTrustCaseAction[];
  } | null;
}

export interface AdminTrustCase {
  id: string;
  entityType: string;
  status: "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
  priority: TrustRiskLevel;
  title: string;
  reasonCode: string | null;
  summary: string | null;
  openedAt: string;
  closedAt: string | null;
  assignedAdmin?: { id: string; name: string } | null;
  employerTrustProfile?: {
    employer: { id: string; companyName: string; userId: string };
  } | null;
  candidateTrustProfile?: {
    user: { id: string; name: string; email: string };
  } | null;
  job?: {
    id: string;
    title: string;
    employer?: { id: string; companyName: string; userId: string };
  } | null;
  application?: {
    id: string;
    candidateId: string;
    jobId: string;
  } | null;
  report?: {
    id: string;
    reason: string;
    status: string;
    reportedUserId: string | null;
  } | null;
  artifact?: {
    id: string;
    type: string;
    status: string;
  } | null;
  actions: AdminTrustCaseAction[];
}

export interface AdminAbuseReport {
  id: string;
  reason: string;
  details: string | null;
  status: "OPEN" | "TRIAGED" | "RESOLVED" | "DISMISSED";
  resolutionNotes: string | null;
  createdAt: string;
  reporter: { id: string; name: string; email: string };
  reportedUser?: { id: string; name: string; email: string; role: string } | null;
  employer?: { id: string; companyName: string; userId: string } | null;
  targetJob?: { id: string; title: string; status: string } | null;
  targetApplication?: { id: string; status: string } | null;
  assignedAdmin?: { id: string; name: string } | null;
  trustCase?: { id: string; actions: AdminTrustCaseAction[] } | null;
}

export interface AdminPartnerSummary {
  id: string;
  externalId: string;
  name: string;
  organizationType: PartnerOrganizationType;
  country: string;
  website: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt?: string;
  _count?: {
    records: number;
    verifiedSkills: number;
    partnerMarkers: number;
  };
}

export interface AdminIssuedPartnerSkill extends CandidateVerifiedSkillItem {
  user: { id: string; name: string; email: string };
}

export interface AdminIssuedPartnerMarker extends CandidatePartnerMarkerItem {
  user: { id: string; name: string; email: string };
}

export interface AdminPartnerDetail {
  partner: AdminPartnerSummary;
  records: Array<{
    id: string;
    type: string;
    externalRecordId: string;
    status: string;
    payload: Record<string, unknown>;
    receivedAt: string;
    processedAt: string | null;
  }>;
  issuedSkills: AdminIssuedPartnerSkill[];
  issuedMarkers: AdminIssuedPartnerMarker[];
}

export interface AbuseReportInput {
  reason:
    | "SCAM"
    | "FAKE_JOB"
    | "IMPERSONATION"
    | "SPAM"
    | "OFF_PLATFORM_CONTACT"
    | "ADVANCE_FEE_REQUEST"
    | "HARASSMENT"
    | "FAKE_PROFILE"
    | "MISLEADING_SALARY"
    | "OTHER";
  details?: string;
  reportedUserId?: string;
  employerId?: string;
  targetJobId?: string;
  targetApplicationId?: string;
  targetThreadId?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "CANDIDATE" | "EMPLOYER";
  emailVerified?: boolean;
  avatarUrl?: string | null;
  employer?: {
    id: string;
    companyName: string;
    location: string;
  };
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: "CANDIDATE" | "EMPLOYER";
  companyName?: string;
  location?: string;
}

export interface Job {
  id: string;
  title: string;
  slug: string;
  description: string;
  location: string;
  type: string;
  jobField?: string | null;
  workplaceType?: string | null;
  seniority: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: string | null;
  tags: string[];
  visaSponsorship?: "YES" | "NO" | "UNKNOWN";
  relocationAssistance?: boolean;
  eligibleCountries?: string[];
  jobSource?: "EMPLOYER_POSTED" | "AGGREGATED";
  sourceName?: string;
  sourceUrl?: string;
  applicationUrl?: string | null;
  isExpired?: boolean;
  expiresAt?: string | null;
  status: string;
  publishedAt?: string;
  createdAt: string;
  moderationRequired?: boolean;
  trust?: JobTrustSummary;
  discovery?: JobDiscoverySummary;
  rankingExplanation?: JobRankingExplanation;
  sourceLineage?: JobSourceLineageItem[];
  employer: {
    companyName: string;
    location: string;
    website?: string | null;
    bio?: string | null;
    trust?: EmployerTrustSummary | null;
  };
  _count?: {
    applications: number;
  };
}

export interface JobListParams {
  search?: string;
  query?: string;
  location?: string;
  type?: string;
  employmentType?: string;
  jobField?: string;
  workplaceType?: string;
  seniority?: string;
  visaSponsorship?: string;
  relocationAssistance?: string;
  remote?: string;
  remoteOnly?: string;
  salaryMin?: number;
  salaryMax?: number;
  country?: string;
  provider?: string;
  includeExpandedKeywords?: string;
  sortBy?: "relevance" | "newest" | "salary" | "companyQuality";
  page?: number;
  limit?: number;
}

export interface JobListResponse {
  jobs: Job[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateJobData {
  title: string;
  description: string;
  location: string;
  type: string;
  seniority: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: string;
  tags?: string[];
  applicationUrl?: string;
}

export interface Application {
  id: string;
  status: string;
  cvUrl?: string;
  coverLetter?: string;
  notes?: string;
  createdAt: string;
  heldForReview?: boolean;
  job: {
    id: string;
    title: string;
    slug: string;
    location?: string;
    type?: string;
    employer?: {
      companyName: string;
    };
  };
  candidate?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Resource {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  coverImage?: string;
  publishedAt?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "REVIEWED";
  reviewNotes: string | null;
}

export interface ResourceListResponse {
  resources: Resource[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminStats {
  totalUsers: number;
  totalJobs: number;
  pendingJobs: number;
  totalApplications: number;
  totalResources: number;
}

export interface PublicStats {
  activeCandidates: number;
  partnerCompanies: number;
  jobsPosted: number;
  africanCountries: number;
  lastUpdated: string;
}

export type AccountRestrictionStatus = "ACTIVE" | "LIMITED" | "SUSPENDED";

export type AdminPermission =
  | "VIEW_USERS"
  | "MANAGE_USER_ACCOUNTS"
  | "RESET_USER_PASSWORD"
  | "RESTRICT_USER_ACCOUNT"
  | "REVIEW_JOBS"
  | "REVIEW_APPLICATIONS"
  | "REVIEW_RESOURCES"
  | "REVIEW_COMPANY_DATA"
  | "VIEW_TRUST_CASES"
  | "MANAGE_TRUST_CASES"
  | "VIEW_ABUSE_REPORTS"
  | "MANAGE_ABUSE_REPORTS"
  | "VIEW_VERIFICATION_ARTIFACTS"
  | "APPROVE_VERIFICATION"
  | "VIEW_AUDIT_LOGS"
  | "VIEW_HEALTH_STATUS"
  | "MANAGE_ALERTS"
  | "VIEW_SYSTEMS_METRICS"
  | "VIEW_BILLING_DATA"
  | "MANAGE_BILLING_DISPUTES"
  | "VIEW_REVENUE_REPORTS"
  | "EXPORT_DATA"
  | "RUN_BULK_OPERATIONS"
  | "MODIFY_BULK_DATA";

export interface AdminUserListItem extends User {
  createdAt: string;
  emailVerified?: boolean;
  accountRestrictionStatus: AccountRestrictionStatus;
  accountRestrictionReason: string | null;
  accountRestrictedAt: string | null;
  adminRole: {
    id: string;
    title: string;
    description?: string | null;
    permissions: AdminPermission[];
    isActive: boolean;
  } | null;
  _count: {
    applications: number;
    companyReviews: number;
    sentMessages: number;
  };
}

export interface AdminUserDetailResponse {
  user: AdminUserListItem & {
    preferredLocale: string;
    emailVerifiedAt: string | null;
    deletionRequestedAt: string | null;
    deletedAt: string | null;
    phoneVerifiedAt: string | null;
    updatedAt: string;
    candidateProfile: {
      id: string;
      headline: string | null;
      targetCountries: string[];
      yearsExperience: number | null;
    } | null;
    subscription: {
      plan: string;
      status: string;
      currentPeriodEnd: string | null;
    } | null;
    _count: AdminUserListItem["_count"] & {
      savedSearches: number;
      notifications: number;
    };
  };
  auditLogs: Array<{
    id: string;
    action: string;
    changes: unknown;
    reason: string | null;
    status: string;
    createdAt: string;
    admin: {
      title: string;
      admin: { id: string; name: string; email: string };
    } | null;
  }>;
}

export interface UserListResponse {
  users: AdminUserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BillingStatus {
  plan: "FREE" | "BASIC" | "PROFESSIONAL" | "EMPLOYER_FREE" | "EMPLOYER_BASIC" | "EMPLOYER_PREMIUM";
  status: "ACTIVE" | "INACTIVE" | "PAST_DUE" | "CANCELLED";
  currentPeriodEnd: string | null;
  billingProvider: "STRIPE" | "FLUTTERWAVE" | "PAYPAL" | null;
  hasCustomer: boolean;
  hasPortal: boolean;
}

export interface BillingEntitlementState {
  id: string;
  effectivePlan: BillingStatus["plan"];
  effectiveStatus: BillingStatus["status"];
  billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
  currency: string | null;
  pricingVersion: number | null;
  entitlements: PlanEntitlements;
  checksum: string;
  isInSync: boolean;
  source: string;
  lastSyncedAt: string;
  lastValidatedAt: string | null;
}

export interface BillingEntitlementValidation {
  currentState: {
    id: string;
    effectivePlan: BillingStatus["plan"];
    effectiveStatus: BillingStatus["status"];
    checksum: string;
    billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
    currency: string | null;
    pricingVersion: number | null;
  } | null;
  expected: {
    subscriptionId: string | null;
    subscriptionPlan: BillingStatus["plan"];
    subscriptionStatus: BillingStatus["status"];
    effectivePlan: BillingStatus["plan"];
    effectiveStatus: BillingStatus["status"];
    billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
    currency: string | null;
    pricingVersion: number | null;
    checksum: string;
    isGrandfathered: boolean;
    profileCountry: string | null;
    stripeCountry: string | null;
  };
  reasons: string[];
  isStale: boolean;
}

export interface BillingAuditEventRecord {
  id: string;
  eventId: string | null;
  source: string;
  eventType: string;
  outcome: "RECEIVED" | "PROCESSED" | "FAILED" | "DUPLICATE" | "RECONCILED";
  plan: BillingStatus["plan"] | null;
  status: BillingStatus["status"] | null;
  billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
  currency: string | null;
  amountMinor: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeRefundId: string | null;
  reasonCode: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  processedAt: string | null;
  createdAt: string;
}

export interface BillingSupportActionRecord {
  id: string;
  actionType: "NOTE" | "RESYNC_ENTITLEMENTS" | "RESEND_RECEIPT" | "REFUND_REVIEW" | "CANCEL_SUBSCRIPTION" | "UPGRADE_DOWNGRADE_CORRECTION" | "GRANDFATHER_OVERRIDE";
  reasonCode: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AdminBillingDiscrepancy {
  id: string;
  type: "WEBHOOK_FAILURE" | "SUBSCRIPTION_STATE_MISMATCH" | "PLAN_MISMATCH" | "UNPAID_BUT_ENTITLED" | "PAID_BUT_NOT_ENTITLED" | "PENDING_REFUND" | "REGION_MISMATCH" | "STALE_ENTITLEMENT" | "PAYMENT_FAILURE";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  reasonCode: string | null;
  details: Record<string, unknown> | null;
  dueAt: string | null;
  detectedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  subscription?: {
    id: string;
    plan: BillingStatus["plan"];
    status: BillingStatus["status"];
  } | null;
}

export interface AdminBillingReconciliationRun {
  id: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  triggeredBy: string;
  checkedSubscriptions: number;
  successPayments: number;
  failedPayments: number;
  webhookFailures: number;
  subscriptionMismatches: number;
  unpaidEntitlements: number;
  paidNotEntitled: number;
  pendingRefunds: number;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface AdminBillingDashboard {
  metrics: {
    successfulPayments: number;
    failedPayments: number;
    webhookFailures: number;
    mismatchedSubscriptionStates: number;
    unpaidButEntitled: number;
    paidButNotEntitled: number;
    pendingRefunds: number;
  };
  lastReconciliationRun: AdminBillingReconciliationRun | null;
  recentDiscrepancies: AdminBillingDiscrepancy[];
  windows: {
    paymentsSince: string;
  };
}

export interface AdminBillingCustomerSearchResult {
  id: string;
  name: string;
  email: string;
  role: string;
  subscription: {
    id: string;
    plan: BillingStatus["plan"];
    status: BillingStatus["status"];
    stripeCustomerId: string | null;
    stripeSubId: string | null;
  } | null;
  billingProfile: {
    region: "AFRICA" | "EUROPE" | "ROW";
    country: string | null;
    currency: string;
    isGrandfathered: boolean;
    pricingVersion: number;
  } | null;
}

export interface AdminBillingCustomerDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  subscription: {
    id: string;
    plan: BillingStatus["plan"];
    status: BillingStatus["status"];
    billingProvider: "STRIPE" | "FLUTTERWAVE" | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    stripeCustomerId: string | null;
    stripeSubId: string | null;
    currentPeriodEnd: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  billingProfile: {
    region: "AFRICA" | "EUROPE" | "ROW";
    country: string | null;
    currency: string;
    regionSource: string;
    pricingVersion: number;
    isGrandfathered: boolean;
    grandfatheredAt: string | null;
    taxIdType: string | null;
    taxIdValue: string | null;
    stripeCountry: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  billingEntitlementState: BillingEntitlementState | null;
  billingEvents: BillingAuditEventRecord[];
  billingDiscrepancies: AdminBillingDiscrepancy[];
  billingSupportActions: BillingSupportActionRecord[];
}

export interface RegionalPriceInfo {
  plan: string;
  region: string;
  interval: "MONTHLY" | "YEARLY";
  currency: string;
  amount: number;
  stripePriceId: string | null;
  displayAmount: string;
}

export interface PlanEntitlements {
  plan: string;
  applicationsPerMonth: number | null;
  aiResumeReviews: number | null;
  aiJobMatches: number | null;
  aiApplyPacks: number | null;
  savedSearches: number | null;
  jobAlerts: boolean;
  prioritySupport: boolean;
  skillsAssessments: boolean;
  chatAccess: boolean;
  autopilot: boolean;
  jobPostsPerMonth: number | null;
  talentSearch: boolean;
  analytics: boolean;
  apiAccess: boolean;
  atsIntegrations: number | null;
  videoMockInterviews: number | null;
  pipelineExports: boolean;
  brandedCareerPage: boolean;
  advancedFunnelMetrics: boolean;
}

export interface PricingData {
  region: string;
  currency: string;
  availableCurrencies: string[];
  taxBehavior: string;
  taxLabel: string | null;
  prices: RegionalPriceInfo[];
  entitlements: Record<string, PlanEntitlements>;
}

export interface UserPricingData extends PricingData {
  country: string | null;
  confidence: "high" | "medium" | "low";
  source: string;
  isGrandfathered: boolean;
  pricingVersion: number;
  taxId: { type: string; value: string | null } | null;
}

export interface RegionConfig {
  id: string;
  region: string;
  defaultCurrency: string;
  currencies: string[];
  countries: string[];
  taxBehavior: string;
  taxLabel: string | null;
}

export interface PaymentLocalizationResponse {
  regions: Array<{
    region: string;
    defaultCurrency: string;
    currencies: string[];
    taxBehavior: string;
    taxLabel: string | null;
    paymentMethodsLive: string[];
    paymentMethodsRoadmap: string[];
    compliance: unknown;
    taxMetadata: unknown;
  }>;
  europeSpecific: {
    supportedTaxIds: string[];
    invoiceRules: string[];
  };
  africaRoadmap: {
    plannedMethods: string[];
    status: string;
  };
}

export interface MessageThread {
  id: string;
  job: { id: string; title: string; slug: string } | null;
  application: { id: string; status: string; candidate?: { id: string; name: string } } | null;
  participants: Array<{ id: string; name: string; email: string; role: string }>;
  lastMessage: Message | null;
  messages?: Message[];
  updatedAt: string;
  createdAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; role?: string };
}

export interface ThreadListResponse {
  threads: MessageThread[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ThreadDetailResponse {
  thread: MessageThread;
  messages: Message[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TalentProfile {
  id: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience: number | null;
  visaStatus: string | null;
  openToWork: boolean;
  profileCompleteness: number;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  workHistory?: CandidateWorkHistoryItem[] | null;
  educationHistory?: CandidateEducationItem[] | null;
  certifications?: CandidateCertificationItem[] | null;
  user: { id: string; name: string; email: string };
  skillAssessments?: Array<{ skillName: string; score: number | null; level: string | null }>;
  verifiedSkills?: CandidateVerifiedSkillItem[];
  partnerMarkers?: CandidatePartnerMarkerItem[];
  trust?: CandidateTrustSummary | null;
  match: TalentMatchSummary;
  mobility: TalentMobilitySummary;
  poolMemberships: TalentPoolMembership[];
}

export interface TalentMobilitySummary {
  score: number;
  label: "READY" | "PROMISING" | "EARLY";
  factors: string[];
  activeProcess: {
    visaType: string;
    targetCountry: string;
    status: string;
  } | null;
}

export interface TalentMatchSummary {
  score: number;
  semanticScore: number;
  skillScore: number;
  experienceScore: number;
  trustScore: number;
  mobilityScore: number;
  reasons: string[];
  mobility: TalentMobilitySummary;
}

export interface TalentPoolMembership {
  id: string;
  stage: string;
  notes: string | null;
  poolId: string;
  poolName: string;
}

export interface TalentPool {
  id: string;
  name: string;
  description: string | null;
  candidateCount: number;
  createdAt: string;
  updatedAt: string;
  recentCandidates: Array<{
    id: string;
    candidateUserId: string;
    stage: string;
    candidateName: string;
  }>;
}

export interface TalentComparisonResponse {
  candidates: TalentProfile[];
  comparison: {
    commonSkills: string[];
    recommendedLead: string | null;
    summary: string;
  };
}

export interface TalentSearchResponse {
  candidates: TalentProfile[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  semantic?: {
    query: string | null;
    hitCount: number;
    providerUsed: boolean;
  };
}

export interface EmployerAnalytics {
  totalJobs: number;
  publishedJobs: number;
  totalApplications: number;
  qualifiedApplicants: number;
  shortlistRate: number;
  applicationsByStatus: Record<string, number>;
  recentApplications: Array<{ id: string; status: string; createdAt: string; candidate: { name: string }; job: { title: string } }>;
  activationMilestones: EmployerActivationMilestones;
  activationState: EmployerActivationState;
  timeToFirstQualifiedApplicantHours: number | null;
  verificationImpact: EmployerVerificationImpact;
  viewsByDay: Array<{ date: string; views: number }>;
}

export interface EmployerAdvancedAnalytics {
  funnel: Array<{
    step: string;
    count: number;
    conversionFromPrevious: number | null;
  }>;
  postingPerformance: Array<{
    jobId: string;
    title: string;
    status: string;
    applicationCount: number;
    qualifiedApplicants: number;
    shortlistRate: number;
    acceptanceRate: number;
    impressions: number;
    clicks: number;
    ctr: number;
    qualityScore: number;
    timeToFirstApplicationHours: number | null;
  }>;
  candidatePipeline: {
    total: number;
    pending: number;
    reviewing: number;
    shortlisted: number;
    accepted: number;
    rejected: number;
    avgReviewTimeHours: number | null;
  };
  roi: EmployerRoiSummary;
  activationMilestones: EmployerActivationMilestones;
}

export interface ATSConnection {
  id: string;
  provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
  providerLabel: string;
  displayName: string | null;
  externalOrgId: string;
  status: "ACTIVE" | "ERROR" | "DISCONNECTED";
  healthStatus: ATSHealthStatus;
  metadata: Record<string, unknown> | null;
  credentials: {
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    hasWebhookSecret: boolean;
  };
  webhookSyncEnabled: boolean;
  twoWaySyncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastConnectionTestAt: string | null;
  lastConnectionTestOk: boolean | null;
  lastWebhookAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  capabilities: ATSCapabilityState;
  recentLogSummary: {
    failedSyncRuns: number;
    failedWebhookEvents: number;
    pendingApplicationLinks: number;
  };
  lastSyncRun: {
    id: string;
    status: "QUEUED" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
    syncType: string;
    direction: string;
    trigger: string;
    correlationId: string | null;
    startedAt: string;
    finishedAt: string | null;
    pulledJobs: number;
    createdJobs: number;
    updatedJobs: number;
    dedupedJobs: number;
    processedEvents: number;
    pushedCandidates: number;
    updatedStages: number;
    retryCount: number;
    errorCount: number;
    warnings?: unknown;
    errors?: unknown;
  } | null;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type ATSHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "NEEDS_ATTENTION";

export interface ATSCapabilityState {
  provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
  label: string;
  jobImportSupported: boolean;
  jobImportReady: boolean;
  webhookSupported: boolean;
  webhookReady: boolean;
  stageWritebackSupported: boolean;
  stageWritebackReady: boolean;
  notes: string[];
}

export interface ATSSyncRunResult {
  syncRunId: string;
  pulledJobs: number;
  createdJobs: number;
  updatedJobs: number;
  dedupedJobs: number;
}

export interface ATSSyncRunItem {
  id: string;
  connectionId: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  syncType: string;
  direction: string;
  trigger: string;
  correlationId: string | null;
  startedAt: string;
  finishedAt: string | null;
  pulledJobs: number;
  createdJobs: number;
  updatedJobs: number;
  dedupedJobs: number;
  processedEvents: number;
  pushedCandidates: number;
  updatedStages: number;
  retryCount: number;
  errorCount: number;
  cursor: string | null;
  errors: unknown;
  warnings: unknown;
  metadata: unknown;
}

export interface ATSWebhookEventItem {
  id: string;
  connectionId: string;
  provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
  eventType: string;
  eventKey: string | null;
  status: "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
  httpHeaders: Record<string, unknown> | null;
  payload: unknown;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface ATSAuditLogItem {
  id: string;
  connectionId: string;
  actorUserId: string | null;
  actionType: string;
  reasonCode: string | null;
  summary: string;
  syncRunId: string | null;
  webhookEventId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ATSApplicationLinkItem {
  id: string;
  connectionId: string;
  applicationId: string;
  externalJobId: string | null;
  externalApplicationId: string | null;
  externalCandidateId: string | null;
  externalStageId: string | null;
  externalStageName: string | null;
  status: "PENDING" | "SYNCED" | "FAILED" | "MANUAL_REVIEW";
  lastOutboundSyncAt: string | null;
  lastInboundSyncAt: string | null;
  lastSyncError: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  application: {
    id: string;
    status: string;
    candidate: {
      id: string;
      name: string;
      email: string;
    };
    job: {
      id: string;
      title: string;
      slug: string;
    };
  };
}

export interface ATSConnectionLogs {
  connection: ATSConnection;
  syncRuns: ATSSyncRunItem[];
  webhookEvents: ATSWebhookEventItem[];
  auditLogs: ATSAuditLogItem[];
  applicationLinks: {
    stats: {
      total: number;
      synced: number;
      pending: number;
      manualReview: number;
      failed: number;
    };
    recent: ATSApplicationLinkItem[];
  };
}

export interface EmployerAtsDashboard {
  summary: {
    totalConnections: number;
    healthyConnections: number;
    degradedConnections: number;
    downConnections: number;
    needsAttentionConnections: number;
    webhookEnabledConnections: number;
    twoWayEnabledConnections: number;
    failedSyncRuns: number;
    failedWebhookEvents: number;
  };
  providerBreakdown: Array<{
    provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
    label?: string;
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    needsAttention: number;
  }>;
  connections: ATSConnection[];
}

export interface AdminAtsDashboard extends EmployerAtsDashboard {
  summary: EmployerAtsDashboard["summary"] & {
    failedSyncRunsLast7Days: number;
    failedWebhooksLast7Days: number;
  };
  connections: Array<ATSConnection & {
    employer: {
      id: string;
      companyName: string;
      user: {
        id: string;
        email: string;
        name: string;
      };
    };
  }>;
  recentFailedSyncs: Array<ATSSyncRunItem & {
    connection: {
      id: string;
      provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
      employer: {
        companyName: string;
        user: {
          email: string;
          name: string;
        };
      };
    };
  }>;
  recentFailedWebhooks: Array<ATSWebhookEventItem & {
    connection: {
      id: string;
      provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
      employer: {
        companyName: string;
        user: {
          email: string;
          name: string;
        };
      };
    };
  }>;
}

export interface MockInterviewArtifact {
  id: string;
  sessionId: string;
  type: "VIDEO" | "AUDIO" | "TRANSCRIPT" | "FEEDBACK_JSON";
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface MockInterviewSession {
  id: string;
  userId: string;
  title: string;
  targetRole: string;
  promptLanguage: "EN" | "ES" | "FR" | "PT" | "AR";
  questionSet: unknown;
  transcript: unknown;
  feedbackSummary: string | null;
  scoreOverall: number | null;
  scoreCommunication: number | null;
  scoreTechnical: number | null;
  scoreProblemSolving: number | null;
  status: "DRAFT" | "PROCESSING" | "READY" | "ARCHIVED";
  visibility: "PRIVATE" | "TEAM_SHARED";
  retentionDays: number;
  piiRedacted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  artifacts?: MockInterviewArtifact[];
}

export interface EmployerOnboarding {
  currentStep: EmployerOnboardingStep;
  checklist: EmployerOnboardingChecklistItem[];
  completionPct: number;
  stats: {
    jobCount: number;
    publishedJobs: number;
    totalApplications: number;
    qualifiedApplicants: number;
  };
  milestones: EmployerActivationMilestones;
  activationState: EmployerActivationState;
  candidateFilters: EmployerCandidateFilters;
  teamMemberEmails: string[];
  selectedPlan: BillingStatus["plan"];
  trust: EmployerTrustSummary;
  company: {
    companyName: string;
    website: string | null;
    location: string;
    bio: string | null;
    email: string;
  };
  nextAction: EmployerNextAction;
  recommendation: string;
  upgradeJourney: EmployerUpgradeJourney;
}

export interface EmployerBranding {
  id: string;
  companyName: string;
  website: string | null;
  location: string;
  bio: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  accentColor: string | null;
  premiumBrandingEnabled: boolean;
  subscriptionPlan: BillingStatus["plan"];
}

export type EmployerOnboardingStep =
  | "company_setup"
  | "verification"
  | "team_setup"
  | "first_job_post"
  | "candidate_filters"
  | "subscription_choice"
  | "trust_completion";

export interface EmployerCandidateFilters {
  skills: string[];
  location: string | null;
  minExperience: number | null;
  verifiedOnly: boolean;
  visaPreference: "ANY" | "SPONSORED_ONLY";
}

export interface EmployerActivationMilestones {
  firstApprovedJobAt: string | null;
  firstCandidateViewAt: string | null;
  firstQualifiedShortlistAt: string | null;
}

export interface EmployerActivationState {
  label: string;
  state: "not_started" | "in_progress" | "activated";
}

export interface EmployerVerificationImpact {
  verified: boolean;
  qualifiedApplicantRate: number;
  insight: string;
}

export interface EmployerUpgradeJourney {
  targetPlan: BillingStatus["plan"] | null;
  headline: string;
  body: string;
  ctaLabel: string;
}

export interface EmployerOnboardingChecklistItem {
  key: EmployerOnboardingStep;
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export interface EmployerNextAction {
  key: EmployerOnboardingStep;
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
}

export interface EmployerRoiSummary {
  impressions: number;
  clicks: number;
  applies: number;
  qualifiedApplicants: number;
  shortlistRate: number;
  clickToApplyRate: number;
  timeToFirstQualifiedApplicantHours: number | null;
  averageJobQuality: number;
  verificationImpact: EmployerVerificationImpact;
  upgradeJourney: EmployerUpgradeJourney;
}

export interface EmployerOnboardingUpdateInput {
  currentStep?: EmployerOnboardingStep;
  selectedPlan?: Extract<BillingStatus["plan"], "EMPLOYER_FREE" | "EMPLOYER_BASIC" | "EMPLOYER_PREMIUM"> | null;
  teamMemberEmails?: string[];
  candidateFilters?: EmployerCandidateFilters;
  companyName?: string;
  website?: string;
  location?: string;
  bio?: string;
}

export interface EmployerOnboardingStateSnapshot {
  currentStep: EmployerOnboardingStep;
  teamMemberEmails: string[];
  candidateFilters: EmployerCandidateFilters;
  selectedPlan: Extract<BillingStatus["plan"], "EMPLOYER_FREE" | "EMPLOYER_BASIC" | "EMPLOYER_PREMIUM"> | null;
}

export interface EmployerJobPreviewInput {
  title: string;
  description: string;
  location: string;
  type: string;
  seniority: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  tags?: string[];
}

export interface EmployerJobPreview {
  qualityScore: number;
  qualityLabel: "TRUSTED" | "SOLID" | "REVIEW" | "THIN";
  moderationRiskLevel: TrustRiskLevel;
  moderationRequired: boolean;
  guidance: string;
  flags: string[];
  strengths: string[];
  tips: string[];
  checklist: Array<{
    key: string;
    label: string;
    done: boolean;
  }>;
}

// Profile
export const profile = {
  get: () => fetchAPI<CandidateProfile | null>("/api/profile"),
  update: (data: Partial<CandidateProfile>) =>
    fetchAPI<CandidateProfile>("/api/profile", { method: "PUT", body: JSON.stringify(data) }),
  resumes: () => fetchAPI<ResumeFile[]>("/api/profile/resumes"),
  uploadResume: (data: { s3Key: string; fileName: string; setActive?: boolean }) =>
    fetchAPI<ResumeFile>("/api/profile/resumes", { method: "POST", body: JSON.stringify(data) }),
  parseResume: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return fetchMultipartAPI<ResumeParseResponse>("/api/profile/resume-parser/parse", {
      method: "POST",
      body: formData,
    });
  },
  applyResumeDraft: (data: {
    confirm: boolean;
    overwriteExisting?: boolean;
    draft: Partial<ResumeProfileDraft>;
  }) =>
    fetchAPI<{ profile: CandidateProfile; overwriteExisting: boolean; message: string }>(
      "/api/profile/resume-parser/apply-draft",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  analytics: () => fetchAPI<ProfileAnalytics>("/api/profile/analytics"),
};

// Notifications
export const notifications = {
  list: (params?: { status?: string; page?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.page) sp.set("page", params.page.toString());
    if (params?.limit) sp.set("limit", params.limit.toString());
    const q = sp.toString();
    return fetchAPI<NotificationListResponse>(`/api/notifications${q ? `?${q}` : ""}`);
  },
  unreadCount: () => fetchAPI<{ count: number }>("/api/notifications/unread-count"),
  markRead: (id: string) => fetchAPI<{ notification: NotificationItem }>(`/api/notifications/${id}/read`, { method: "PUT" }),
  markAllRead: () => fetchAPI<{ updated: number }>("/api/notifications/read-all", { method: "PUT" }),
};

export const preferences = {
  getLocale: () => fetchAPI<{ preferredLocale: "EN" | "ES" | "FR" | "PT" | "AR" }>("/api/preferences/locale"),
  setLocale: (preferredLocale: "EN" | "ES" | "FR" | "PT" | "AR") =>
    fetchAPI<{ preferredLocale: "EN" | "ES" | "FR" | "PT" | "AR" }>("/api/preferences/locale", {
      method: "PUT",
      body: JSON.stringify({ preferredLocale }),
    }),
};

export const pushNotifications = {
  getVapidPublicKey: () => fetchAPI<{ publicKey: string }>("/api/push/vapid-public-key"),
  getPreferences: () => fetchAPI<NotificationPreference>("/api/push/preferences"),
  updatePreferences: (data: Partial<NotificationPreference>) =>
    fetchAPI<NotificationPreference>("/api/push/preferences", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  subscribe: (subscription: PushSubscriptionRequest) =>
    fetchAPI<{ id: string }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),
  unsubscribe: (endpoint: string) =>
    fetchAPI<{ message: string }>("/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),
  sendTest: (
    type:
      | "savedSearchAlerts"
      | "weeklyDigests"
      | "applicationReminders"
      | "profileCompletionNudges"
      | "verificationCompletionNudges"
      | "visaRelocationAlerts"
      | "salaryInsights"
      | "interviewPrepRecommendations"
      | "interviewReminders"
      | "applicationUpdates"
      | "subscriptionNotices",
  ) =>
    fetchAPI<{ message: string; notificationId: string }>("/api/push/test", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
};

// Saved Searches
function unwrapSavedSearch(
  payload:
    | SavedSearchItem
    | { savedSearch: SavedSearchItem }
    | { savedSearches: SavedSearchItem[] }
    | SavedSearchItem[],
) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if ("savedSearches" in payload) {
    return payload.savedSearches;
  }
  if ("savedSearch" in payload) {
    return payload.savedSearch;
  }
  return payload;
}

export const savedSearches = {
  list: async () =>
    unwrapSavedSearch(
      await fetchAPI<SavedSearchItem[] | { savedSearches: SavedSearchItem[] }>("/api/saved-searches"),
    ) as SavedSearchItem[],
  create: (data: Partial<SavedSearchItem>) =>
    fetchAPI<SavedSearchItem | { savedSearch: SavedSearchItem }>("/api/saved-searches", {
      method: "POST",
      body: JSON.stringify(data),
    }).then((payload) => unwrapSavedSearch(payload) as SavedSearchItem),
  update: (id: string, data: Partial<SavedSearchItem>) =>
    fetchAPI<SavedSearchItem | { savedSearch: SavedSearchItem }>(`/api/saved-searches/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }).then((payload) => unwrapSavedSearch(payload) as SavedSearchItem),
  delete: (id: string) => fetchAPI<void>(`/api/saved-searches/${id}`, { method: "DELETE" }),
  getJobs: (id: string) => fetchAPI<JobListResponse>(`/api/saved-searches/${id}/jobs`),
};

// Salary Reports
export const salaryReports = {
  list: (params?: { jobTitle?: string; country?: string; companyId?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.jobTitle) sp.set("jobTitle", params.jobTitle);
    if (params?.country) sp.set("country", params.country);
    if (params?.companyId) sp.set("companyId", params.companyId);
    if (params?.page) sp.set("page", params.page.toString());
    const q = sp.toString();
    return fetchAPI<SalaryReportResponse>(`/api/salary-reports${q ? `?${q}` : ""}`);
  },
  submit: (data: SalarySubmission) =>
    fetchAPI<SalaryReportItem>("/api/salary-reports", { method: "POST", body: JSON.stringify(data) }),
  compare: (jobTitle: string, countries: string[]) => {
    const sp = new URLSearchParams();
    sp.set("jobTitle", jobTitle);
    countries.forEach(c => sp.append("country", c));
    return fetchAPI<SalaryComparison[]>(`/api/salary-reports/compare?${sp.toString()}`);
  },
  topPaying: () => fetchAPI<TopPayingJob[]>("/api/salary-reports/top-paying"),
};

// Interview Experiences
export const interviewExperiences = {
  list: (params?: { companyId?: string; jobTitle?: string; difficulty?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.set("companyId", params.companyId);
    if (params?.jobTitle) sp.set("jobTitle", params.jobTitle);
    if (params?.difficulty) sp.set("difficulty", params.difficulty);
    if (params?.page) sp.set("page", params.page.toString());
    const q = sp.toString();
    return fetchAPI<InterviewListResponse>(`/api/interview-experiences${q ? `?${q}` : ""}`);
  },
  get: (id: string) => fetchAPI<InterviewExperienceItem>(`/api/interview-experiences/${id}`),
  submit: (data: InterviewSubmission) =>
    fetchAPI<InterviewExperienceItem>("/api/interview-experiences", { method: "POST", body: JSON.stringify(data) }),
  helpful: (id: string) => fetchAPI<void>(`/api/interview-experiences/${id}/helpful`, { method: "POST" }),
  companySummary: (companyId: string) =>
    fetchAPI<InterviewSummary>(`/api/interview-experiences/companies/${companyId}/summary`),
};

// Immigration
export const immigration = {
  processes: () => fetchAPI<ImmigrationProcess[]>("/api/immigration/processes"),
  getProcess: (id: string) => fetchAPI<ImmigrationProcess>(`/api/immigration/processes/${id}`),
  createProcess: (data: { visaType: string; targetCountry: string; notes?: string; startDate?: string; expectedEndDate?: string }) =>
    fetchAPI<ImmigrationProcess>("/api/immigration/processes", { method: "POST", body: JSON.stringify(data) }),
  updateProcess: (id: string, data: Partial<ImmigrationProcess>) =>
    fetchAPI<ImmigrationProcess>(`/api/immigration/processes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProcess: (id: string) => fetchAPI<void>(`/api/immigration/processes/${id}`, { method: "DELETE" }),
  addStep: (processId: string, data: { name: string; description?: string; dueDate?: string; documents?: string[] }) =>
    fetchAPI<ImmigrationStep>(`/api/immigration/processes/${processId}/steps`, { method: "POST", body: JSON.stringify(data) }),
  updateStep: (processId: string, stepId: string, data: { status?: string; completedAt?: string }) =>
    fetchAPI<ImmigrationStep>(`/api/immigration/processes/${processId}/steps/${stepId}`, { method: "PUT", body: JSON.stringify(data) }),
  templates: () => fetchAPI<VisaTemplate[]>("/api/immigration/templates"),
};

// Quick Apply
export const quickApply = {
  /**
   * Submits a quick-apply request.
   * The backend requires `confirm: true` to enforce explicit candidate
   * consent before AfriTalent submits an application on their behalf.
   */
  apply: (jobId: string, opts: { confirm: true } = { confirm: true }) =>
    fetchAPI<Application>("/api/quick-apply", {
      method: "POST",
      body: JSON.stringify({ jobId, confirm: opts.confirm }),
    }),
  checkEligibility: (jobId: string) =>
    fetchAPI<QuickApplyEligibility>(`/api/quick-apply/eligible/${jobId}`),
};

// Skills Assessments
export const skillsAssessments = {
  list: () => fetchAPI<SkillAssessmentItem[]>("/api/skills-assessments"),
  start: (skillName: string) =>
    fetchAPI<SkillAssessmentItem>("/api/skills-assessments", { method: "POST", body: JSON.stringify({ skillName }) }),
  complete: (id: string, score: number) =>
    fetchAPI<SkillAssessmentItem>(`/api/skills-assessments/${id}/complete`, { method: "PUT", body: JSON.stringify({ score }) }),
  available: () => fetchAPI<string[]>("/api/skills-assessments/available"),
};

// Referrals
export const referrals = {
  list: () => fetchAPI<ReferralItem[]>("/api/referrals"),
  create: (data: { refereeEmail: string; jobId?: string; companyName?: string; message?: string }) =>
    fetchAPI<ReferralItem>("/api/referrals", { method: "POST", body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    fetchAPI<ReferralItem>(`/api/referrals/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  stats: () => fetchAPI<ReferralStats>("/api/referrals/stats"),
};

// Learning Resources
export const learning = {
  list: (params?: { category?: string; skills?: string; difficulty?: string; isFree?: boolean; featured?: boolean; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.category) sp.set("category", params.category);
    if (params?.skills) sp.set("skills", params.skills);
    if (params?.difficulty) sp.set("difficulty", params.difficulty);
    if (params?.isFree !== undefined) sp.set("isFree", String(params.isFree));
    if (params?.featured !== undefined) sp.set("featured", String(params.featured));
    if (params?.page) sp.set("page", params.page.toString());
    const q = sp.toString();
    return fetchAPI<LearningListResponse>(`/api/learning${q ? `?${q}` : ""}`);
  },
  categories: () => fetchAPI<string[]>("/api/learning/categories"),
  recommended: () => fetchAPI<LearningResourceItem[]>("/api/learning/recommended"),
  progress: () => fetchAPI<{ progress: LearningProgressItem[] }>("/api/learning/progress"),
  updateProgress: (
    id: string,
    data: { status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; lastStepIndex?: number },
  ) =>
    fetchAPI<{ progress: LearningProgressItem }>(`/api/learning/${id}/progress`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  get: (id: string) => fetchAPI<LearningResourceItem>(`/api/learning/${id}`),
  feedback: {
    submit: (data: LearningFeedbackSubmitInput) =>
      fetchAPI<{ feedback: LearningFeedbackItem; message: string }>("/api/learning/feedback", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    list: (params?: { areaSlug?: string; status?: "PENDING" | "APPROVED" | "REJECTED"; page?: number; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.areaSlug) sp.set("areaSlug", params.areaSlug);
      if (params?.status) sp.set("status", params.status);
      if (params?.page) sp.set("page", params.page.toString());
      if (params?.limit) sp.set("limit", params.limit.toString());
      const q = sp.toString();
      return fetchAPI<LearningFeedbackListResponse>(`/api/learning/feedback${q ? `?${q}` : ""}`);
    },
    moderate: (id: string, data: { action: "approve" | "reject"; moderationNotes?: string }) =>
      fetchAPI<{ feedback: LearningFeedbackItem }>(`/api/learning/feedback/${id}/moderate`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};

// Calendar
export const calendar = {
  list: (params?: { month?: string; eventType?: string }) => {
    const sp = new URLSearchParams();
    if (params?.month) sp.set("month", params.month);
    if (params?.eventType) sp.set("eventType", params.eventType);
    const q = sp.toString();
    return fetchAPI<CalendarEventItem[]>(`/api/calendar${q ? `?${q}` : ""}`);
  },
  get: (id: string) => fetchAPI<CalendarEventItem>(`/api/calendar/${id}`),
  create: (data: Partial<CalendarEventItem>) =>
    fetchAPI<CalendarEventItem>("/api/calendar", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CalendarEventItem>) =>
    fetchAPI<CalendarEventItem>(`/api/calendar/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => fetchAPI<void>(`/api/calendar/${id}`, { method: "DELETE" }),
  upcoming: () => fetchAPI<CalendarEventItem[]>("/api/calendar/upcoming"),
};

// Candidate Analytics
export const candidateAnalytics = {
  profileViews: () => fetchAPI<ProfileViewsData>("/api/candidate-analytics/profile-views"),
  applicationFunnel: () => fetchAPI<ApplicationFunnel>("/api/candidate-analytics/application-funnel"),
  recommendations: () => fetchAPI<Job[]>("/api/candidate-analytics/recommendations"),
  retentionSummary: () => fetchAPI<CandidateRetentionSummaryResponse>("/api/candidate-analytics/retention-summary"),
};

// ──────── New Types ────────

export interface CandidateProfile {
  id: string;
  userId: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience: number | null;
  visaStatus: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  workHistory?: CandidateWorkHistoryItem[] | null;
  educationHistory?: CandidateEducationItem[] | null;
  certifications?: CandidateCertificationItem[] | null;
  openToWork: boolean;
  profileCompleteness: number;
  resumes?: ResumeFile[];
}

export interface ResumeFile {
  id: string;
  s3Key: string;
  fileName: string;
  isActive: boolean;
  uploadedAt: string;
}

export interface ResumeParsedWorkItem {
  company?: string;
  title?: string;
  period?: string;
  description?: string;
}

export interface ResumeParsedEducationItem {
  institution?: string;
  degree?: string;
  period?: string;
}

export interface ResumeParsedData {
  name?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills: string[];
  workHistory: ResumeParsedWorkItem[];
  education: ResumeParsedEducationItem[];
  certifications: string[];
  rawText: string;
}

export interface ResumeProfileDraft {
  headline?: string;
  bio?: string;
  skills?: string[];
  targetRoles?: string[];
  yearsExperience?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  workHistory?: CandidateWorkHistoryItem[];
  educationHistory?: CandidateEducationItem[];
  certifications?: CandidateCertificationItem[];
}

export interface ResumeParseResponse {
  file: { name: string; size: number; mimetype: string };
  parsed: ResumeParsedData;
  profileDraft: ResumeProfileDraft;
  existingProfile: Partial<CandidateProfile> | null;
  requiresConfirmation: boolean;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  savedSearchAlerts: boolean;
  weeklyDigests: boolean;
  applicationReminders: boolean;
  profileCompletionNudges: boolean;
  verificationCompletionNudges: boolean;
  visaRelocationAlerts: boolean;
  salaryInsights: boolean;
  interviewPrepRecommendations: boolean;
  interviewReminders: boolean;
  applicationUpdates: boolean;
  subscriptionNotices: boolean;
  marketing: boolean;
  maxNotificationsPerWeek: number;
  minimumHoursBetweenNotifications: number;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ProfileAnalytics {
  profileViews: number;
  viewsByWeek: Array<{ week: string; count: number }>;
  resumeDownloads: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface SavedSearchItem {
  id: string;
  name: string;
  keywords: string[];
  locations: string[];
  jobTypes: string[];
  seniorities: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  remoteOnly: boolean;
  visaSponsorship: boolean;
  alertEnabled: boolean;
  alertFrequency: string;
  matchCount?: number;
  createdAt: string;
}

export interface CandidateRetentionJourney {
  key:
    | "saved_search"
    | "profile_completion"
    | "verification_completion"
    | "application_momentum"
    | "salary_insight"
    | "interview_prep";
  title: string;
  description: string;
  status: "READY" | "DONE" | "WATCH";
  href: string;
  ctaLabel: string;
  priority: number;
}

export interface CandidateRetentionExperiment {
  key: "digest_hero_v1" | "recommendation_mix_v1";
  variant: string;
}

export interface CandidateWeeklyDigestPreview {
  headline: string;
  trustedJobCount: number;
  verifiedEmployerCount: number;
  salaryTransparentCount: number;
  visaFriendlyCount: number;
  freshnessWindowLabel: string;
  jobs: Job[];
}

export interface CandidateRetentionSummaryResponse {
  snapshot: {
    profileCompleteness: number;
    trustScore: number;
    verificationLevel: CandidateVerificationLevel;
    savedSearchCount: number;
    openApplications: number;
    notificationBudgetRemaining: number;
    lastDigestAt: string | null;
    notificationCadenceHours: number;
    maxNotificationsPerWeek: number;
  };
  recommendations: Job[];
  weeklyDigest: CandidateWeeklyDigestPreview;
  journeys: CandidateRetentionJourney[];
  experiments: CandidateRetentionExperiment[];
  preferences: Pick<
    NotificationPreference,
    | "weeklyDigests"
    | "savedSearchAlerts"
    | "applicationReminders"
    | "profileCompletionNudges"
    | "verificationCompletionNudges"
    | "visaRelocationAlerts"
    | "salaryInsights"
    | "interviewPrepRecommendations"
    | "maxNotificationsPerWeek"
    | "minimumHoursBetweenNotifications"
  >;
}

export interface SalaryReportItem {
  id: string;
  jobTitle: string;
  location: string;
  country: string;
  salaryCurrency: string;
  salaryAmount: number;
  salaryPeriod: string;
  yearsExperience: number | null;
  employmentType: string | null;
  company?: { name: string } | null;
  createdAt: string;
}

export interface SalaryReportResponse {
  reports: SalaryReportItem[];
  aggregates: { avg: number; min: number; max: number; median: number; count: number } | null;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface SalarySubmission {
  jobTitle: string;
  location: string;
  country: string;
  salaryCurrency?: string;
  salaryAmount: number;
  salaryPeriod?: string;
  yearsExperience?: number;
  employmentType?: string;
  companyId?: string;
}

export interface SalaryComparison {
  country: string;
  avgSalary: number;
  minSalary: number;
  maxSalary: number;
  count: number;
}

export interface TopPayingJob {
  jobTitle: string;
  avgSalary: number;
  count: number;
}

export interface InterviewExperienceItem {
  id: string;
  jobTitle: string;
  difficulty: string;
  outcome: string;
  interviewType: string;
  process: string;
  questions: string[];
  tips: string | null;
  duration: string | null;
  helpfulCount: number;
  createdAt: string;
  company: { id: string; name: string };
}

export interface InterviewListResponse {
  experiences: InterviewExperienceItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface InterviewSubmission {
  companyId: string;
  jobTitle: string;
  difficulty: string;
  outcome: string;
  interviewType: string;
  process: string;
  questions: string[];
  tips?: string;
  duration?: string;
}

export interface InterviewSummary {
  totalInterviews: number;
  difficultyBreakdown: Record<string, number>;
  outcomeBreakdown: Record<string, number>;
}

export interface ImmigrationProcess {
  id: string;
  visaType: string;
  targetCountry: string;
  status: string;
  startDate: string | null;
  expectedEndDate: string | null;
  notes: string | null;
  steps: ImmigrationStep[];
  createdAt: string;
}

export interface ImmigrationStep {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  documents: string[];
  sortOrder: number;
}

export interface VisaTemplate {
  visaType: string;
  country: string;
  description: string;
  steps: string[];
}

export interface QuickApplyEligibility {
  eligible: boolean;
  reason?: string;
  profileCompleteness: number;
  hasActiveResume: boolean;
}

export interface SkillAssessmentItem {
  id: string;
  skillName: string;
  provider: string;
  status: string;
  score: number | null;
  level: string | null;
  percentile?: number | null;
  resultUrl?: string | null;
  completedAt: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface ReferralItem {
  id: string;
  refereeEmail: string;
  companyName: string | null;
  message: string | null;
  status: string;
  referrer: { id: string; name: string };
  referee: { id: string; name: string } | null;
  createdAt: string;
}

export interface ReferralStats {
  totalMade: number;
  totalAccepted: number;
  totalHired: number;
}

export interface LearningResourceItem {
  id: string;
  title: string;
  description: string | null;
  url: string;
  provider: string;
  category: string;
  skills: string[];
  difficulty: string;
  durationHours: number | null;
  isFree: boolean;
  imageUrl: string | null;
  featured: boolean;
}

export interface LearningListResponse {
  resources: LearningResourceItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface LearningProgressItem {
  id: string;
  userId: string;
  resourceId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  lastStepIndex: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningFeedbackSubmitInput {
  areaSlug: string;
  lessonTitle?: string;
  firstName: string;
  lastName: string;
  rating: number;
  comment: string;
  attachPhoto: boolean;
}

export interface LearningFeedbackItem {
  id: string;
  areaSlug: string;
  lessonTitle: string | null;
  firstName?: string;
  lastName?: string;
  displayName: string;
  rating: number;
  comment: string;
  avatarUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt: string | null;
  moderationNotes?: string | null;
  createdAt: string;
}

export interface LearningFeedbackListResponse {
  feedback: LearningFeedbackItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CalendarEventItem {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  meetingUrl: string | null;
  jobId: string | null;
  applicationId: string | null;
  reminderMinutes: number | null;
}

export interface ProfileViewsData {
  totalViews: number;
  viewsByWeek: Array<{ week: string; count: number }>;
  viewerRoleBreakdown: Record<string, number>;
}

export interface ApplicationFunnel {
  totalApplied: number;
  reviewing: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
}

// ── Chat Assistant ───────────────────────────────────────────────────────────

export interface ChatConsentPolicy {
  title: string;
  summary: string;
  version: string;
}

export interface ChatConsentStatus {
  consent: {
    privacyNotice: boolean;
    termsOfUse: boolean;
    dataStorage: boolean;
    consentedAt: string | null;
    revokedAt: string | null;
  } | null;
  hasFullConsent: boolean;
  policies: {
    privacyNotice: ChatConsentPolicy;
    termsOfUse: ChatConsentPolicy;
    dataStorage: ChatConsentPolicy;
  };
}

export interface ChatMessageData {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface ChatSendResponse {
  message: ChatMessageData;
  conversationId: string;
  remaining: number;
}

export const chat = {
  getConsent: () =>
    fetchAPI<ChatConsentStatus>("/api/chat/consent"),

  acceptConsent: () =>
    fetchAPI<{ message: string }>("/api/chat/consent", {
      method: "POST",
      body: JSON.stringify({ privacyNotice: true, termsOfUse: true, dataStorage: true }),
    }),

  revokeConsent: () =>
    fetchAPI<{ message: string; deletedConversations: number }>("/api/chat/consent", {
      method: "DELETE",
    }),

  sendMessage: (message: string, conversationId?: string) =>
    fetchAPI<ChatSendResponse>("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({ message, conversationId }),
    }),

  getHistory: (conversationId?: string, page = 1) =>
    fetchAPI<{
      messages?: ChatMessageData[];
      conversations?: ChatConversation[];
      conversation?: ChatConversation;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/chat/history?${conversationId ? `conversationId=${conversationId}&` : ""}page=${page}`),

  newConversation: () =>
    fetchAPI<{ conversation: ChatConversation }>("/api/chat/conversations", { method: "POST" }),

  deleteConversation: (id: string) =>
    fetchAPI<{ message: string }>(`/api/chat/conversations/${id}`, { method: "DELETE" }),
};

// ── AI Skills (premium — PROFESSIONAL plan) ───────────────────────────────────

export interface GeneratedResumeSection {
  summary: string;
  skills: string[];
  experience: Array<{ company: string; title: string; period: string; bullets: string[] }>;
  education: Array<{ institution: string; degree: string; period: string }>;
  certifications: string[];
}

export interface GeneratedResume {
  sections: GeneratedResumeSection;
  rawText: string;
  source: "ai" | "template";
}

export interface JobMatch {
  jobId: string;
  title: string;
  company: string;
  location: string;
  type: string;
  seniority: string;
  slug: string;
  score: number;
  matchMethod: "vector" | "keyword";
  explanation: string;
  verifiedEmployer: boolean;
  // Intelligence fields
  visaSponsorship?: string;
  eligibleCountries?: string[];
  riskScore?: number;
  riskLevel?: string;
  qualityScore?: number;
  qualityLabel?: string;
}

export interface SkillGap {
  skill: string;
  priority: "high" | "medium" | "low";
  reason: string;
}

export interface CareerPath {
  title: string;
  timeline: string;
  description: string;
}

export interface CareerAdviceResult {
  skillGaps: SkillGap[];
  careerPaths: CareerPath[];
  certifications: Array<{ name: string; provider: string; rationale: string }>;
  salaryRange: { min: number; max: number; currency: string; market: string };
  actionPlan: Array<{ week: string; action: string }>;
  summary: string;
}

export const skills = {
  // Resume Builder
  generateResume: (data: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    targetRole: string;
    yearsExperience: number;
    summary?: string;
    skills: string[];
    workHistory: Array<{ company: string; title: string; period: string; description?: string }>;
    educationHistory: Array<{ institution: string; degree: string; period?: string }>;
    certifications?: string[];
  }) =>
    fetchAPI<{ resume: GeneratedResume }>("/api/skills/resume-builder/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  saveResume: (data: { content: Record<string, unknown>; rawText: string }) =>
    fetchAPI<{ message: string; id: string; version: number }>("/api/skills/resume-builder/save", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMyResume: () =>
    fetchAPI<{ resume: { id: string; content: GeneratedResumeSection; rawText: string; version: number; updatedAt: string } | null }>("/api/skills/resume-builder/my-resume"),

  // Job Matcher
  getJobMatches: (limit = 10) =>
    fetchAPI<{ matches: JobMatch[]; total: number; matchMethod: string }>(`/api/skills/job-matcher/matches?limit=${limit}`),

  // Application readiness check
  getApplicationReadiness: (jobId: string) =>
    fetchAPI<{
      jobId: string;
      jobTitle: string;
      status: "READY" | "NEEDS_IMPROVEMENT" | "HIGH_RISK";
      resumeScore: number;
      resumeGrade: "PASS" | "WARN" | "FAIL";
      resumeIssues: Array<{ code: string; severity: string; message: string }>;
      keywordCoverage: number;
      missingKeywords: string[];
      recommendation: string;
    }>(`/api/skills/application-writer/readiness?jobId=${encodeURIComponent(jobId)}`),

  embedResume: () =>
    fetchAPI<{ message: string }>("/api/skills/job-matcher/embed-resume", { method: "POST" }),

  // Application Writer
  generateCoverLetter: (data: {
    jobId: string;
    resumeText?: string;
    tone?: "professional" | "conversational" | "executive";
  }) =>
    fetchAPI<{ coverLetter: string; source: "ai" | "template" }>("/api/skills/application-writer/generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  submitApplication: (data: { jobId: string; coverLetter: string; cvUrl?: string }) =>
    fetchAPI<{ message: string; application: { id: string; status: string; createdAt: string } }>("/api/skills/application-writer/submit", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMyApplications: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return fetchAPI<{
      applications: Array<{
        id: string;
        status: string;
        coverLetter: string | null;
        createdAt: string;
        job: { id: string; title: string; sourceName: string | null; location: string; slug: string };
      }>;
      total: number;
      page: number;
      limit: number;
    }>(`/api/skills/application-writer/my-applications${query ? `?${query}` : ""}`);
  },

  // Career Advisor
  analyseCareer: (data: { targetRole: string; resumeText?: string }) =>
    fetchAPI<{ advice: CareerAdviceResult; sessionId: string; createdAt: string }>("/api/skills/career-advisor/analyze", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getCareerHistory: (limit = 10) =>
    fetchAPI<{
      sessions: Array<{ id: string; targetRole: string | null; adviceContent: CareerAdviceResult; createdAt: string }>;
      total: number;
    }>(`/api/skills/career-advisor/history?limit=${limit}`),

  // ATS Scanner
  scanResumeAts: (data: { resumeText: string; jobDescription?: string }) =>
    fetchAPI<{
      score: number;
      missingKeywords: string[];
      presentKeywords: string[];
      suggestions: string[];
      source: "ai" | "heuristic";
    }>("/api/skills/resume-builder/scan-ats", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Career Gap Explainer
  explainCareerGap: (data: { gapStartDate: string; gapEndDate: string; activities?: string; targetRole?: string }) =>
    fetchAPI<{ explanation: string; framing: string; talkingPoints: string[]; source: "ai" | "template" }>("/api/career-gap/explain", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Salary Negotiation
  getSalaryNegotiation: (data: { role: string; location: string; currency?: string; yearsExperience?: number; currentSalary?: number; targetSalary?: number }) =>
    fetchAPI<{ recommendedRange: string; talkingPoints: string[]; benefitsToNegotiate: string[]; negotiationScript: string; source: "ai" | "template" }>("/api/salary-benchmarks/negotiate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
