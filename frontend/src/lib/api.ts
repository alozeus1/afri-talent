const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface FetchOptions extends RequestInit {
  token?: string;
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
  login: (email: string, password: string) =>
    fetchAPI<{ user: User; expiresIn: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (data: RegisterData) =>
    fetchAPI<{ user: User; expiresIn: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: (token?: string) =>
    fetchAPI<User>("/api/auth/me", { token }),

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

  users: (token?: string, params?: { role?: string; page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.role) searchParams.set("role", params.role);
    if (params?.page) searchParams.set("page", params.page.toString());

    const query = searchParams.toString();
    return fetchAPI<UserListResponse>(`/api/admin/users${query ? `?${query}` : ""}`, { token });
  },
};

// Billing
export const billing = {
  checkout: (plan: string, interval: "MONTHLY" | "YEARLY" = "MONTHLY") =>
    fetchAPI<{ url: string; sessionId: string; currency: string; amount: number | null }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, interval }),
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

// Talent
export const talent = {
  search: (params?: { skills?: string; location?: string; minExperience?: number; page?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.skills) searchParams.set("skills", params.skills);
    if (params?.location) searchParams.set("location", params.location);
    if (params?.minExperience) searchParams.set("minExperience", params.minExperience.toString());
    if (params?.page) searchParams.set("page", params.page.toString());
    const query = searchParams.toString();
    return fetchAPI<TalentSearchResponse>(`/api/talent${query ? `?${query}` : ""}`);
  },
  get: (userId: string) => fetchAPI<TalentProfile>(`/api/talent/${userId}`),
};

// Employer Analytics
export const employerAnalytics = {
  stats: () => fetchAPI<EmployerAnalytics>("/api/employer/analytics"),
  advanced: () => fetchAPI<EmployerAdvancedAnalytics>("/api/employer/analytics/advanced"),
  onboarding: () => fetchAPI<EmployerOnboarding>("/api/employer/onboarding"),
  getBranding: () => fetchAPI<EmployerBranding>("/api/employer/branding"),
  updateBranding: (data: { companyName?: string; website?: string; location?: string; bio?: string }) =>
    fetchAPI<EmployerBranding>("/api/employer/branding", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export const ats = {
  listConnections: () => fetchAPI<ATSConnection[]>("/api/ats/connections"),
  createConnection: (data: {
    provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
    externalOrgId: string;
    accessToken?: string;
    refreshToken?: string;
    metadata?: Record<string, unknown>;
  }) => fetchAPI<ATSConnection>("/api/ats/connections", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  disconnectConnection: (id: string) =>
    fetchAPI<{ message: string }>(`/api/ats/connections/${id}`, {
      method: "DELETE",
    }),
  syncConnection: (id: string) =>
    fetchAPI<{
      syncRunId: string;
      pulledJobs: number;
      createdJobs: number;
      updatedJobs: number;
      dedupedJobs: number;
    }>(`/api/ats/connections/${id}/sync`, {
      method: "POST",
    }),
};

export const mockInterviews = {
  list: () => fetchAPI<MockInterviewSession[]>("/api/mock-interviews"),
  create: (data: {
    title: string;
    targetRole: string;
    promptLanguage?: "EN" | "FR" | "PT" | "AR";
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
  isExpired?: boolean;
  expiresAt?: string | null;
  status: string;
  publishedAt?: string;
  createdAt: string;
  employer: {
    companyName: string;
    location: string;
    website?: string;
    bio?: string;
  };
  _count?: {
    applications: number;
  };
}

export interface JobListParams {
  search?: string;
  location?: string;
  type?: string;
  seniority?: string;
  visaSponsorship?: string;
  relocationAssistance?: string;
  remote?: string;
  salaryMin?: number;
  salaryMax?: number;
  country?: string;
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
}

export interface Application {
  id: string;
  status: string;
  cvUrl?: string;
  coverLetter?: string;
  notes?: string;
  createdAt: string;
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

export interface UserListResponse {
  users: Array<User & { createdAt: string; _count: { applications: number } }>;
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
  hasCustomer: boolean;
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
  user: { id: string; name: string; email: string };
  skillAssessments?: Array<{ skillName: string; score: number | null; level: string | null }>;
}

export interface TalentSearchResponse {
  candidates: TalentProfile[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface EmployerAnalytics {
  totalJobs: number;
  publishedJobs: number;
  totalApplications: number;
  applicationsByStatus: Record<string, number>;
  recentApplications: Array<{ id: string; status: string; createdAt: string; candidate: { name: string }; job: { title: string } }>;
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
    shortlistRate: number;
    acceptanceRate: number;
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
}

export interface ATSConnection {
  id: string;
  provider: "GREENHOUSE" | "LEVER" | "WORKABLE";
  externalOrgId: string;
  status: "ACTIVE" | "ERROR" | "DISCONNECTED";
  metadata: Record<string, unknown> | null;
  lastSyncedAt: string | null;
  lastSyncRun: {
    id: string;
    status: "QUEUED" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
    startedAt: string;
    finishedAt: string | null;
    pulledJobs: number;
    createdJobs: number;
    updatedJobs: number;
    dedupedJobs: number;
    errorCount: number;
  } | null;
  createdAt: string;
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
  promptLanguage: "EN" | "FR" | "PT" | "AR";
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
  checklist: Array<{ key: string; label: string; done: boolean }>;
  completionPct: number;
  stats: {
    jobCount: number;
    publishedJobs: number;
  };
  recommendation: string;
}

export interface EmployerBranding {
  id: string;
  companyName: string;
  website: string | null;
  location: string;
  bio: string | null;
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
  getLocale: () => fetchAPI<{ preferredLocale: "EN" | "FR" | "PT" | "AR" }>("/api/preferences/locale"),
  setLocale: (preferredLocale: "EN" | "FR" | "PT" | "AR") =>
    fetchAPI<{ preferredLocale: "EN" | "FR" | "PT" | "AR" }>("/api/preferences/locale", {
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
  sendTest: (type: "savedSearchAlerts" | "interviewReminders" | "applicationUpdates" | "subscriptionNotices") =>
    fetchAPI<{ message: string; notificationId: string }>("/api/push/test", {
      method: "POST",
      body: JSON.stringify({ type }),
    }),
};

// Saved Searches
export const savedSearches = {
  list: () => fetchAPI<SavedSearchItem[]>("/api/saved-searches"),
  create: (data: Partial<SavedSearchItem>) =>
    fetchAPI<SavedSearchItem>("/api/saved-searches", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<SavedSearchItem>) =>
    fetchAPI<SavedSearchItem>(`/api/saved-searches/${id}`, { method: "PUT", body: JSON.stringify(data) }),
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
  apply: (jobId: string) =>
    fetchAPI<Application>("/api/quick-apply", { method: "POST", body: JSON.stringify({ jobId }) }),
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
  get: (id: string) => fetchAPI<LearningResourceItem>(`/api/learning/${id}`),
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
  interviewReminders: boolean;
  applicationUpdates: boolean;
  subscriptionNotices: boolean;
  marketing: boolean;
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
  createdAt: string;
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
  completedAt: string | null;
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
