// Customer support + company review client. Uses the shared fetchAPI so CSRF
// seeding/retry and cookie auth behave like every other mutating call.
import { fetchAPI } from "@/lib/api";
import type { SupportedLocale } from "@/lib/i18n/config";

export const SUPPORT_TOPICS = [
  "GENERAL",
  "ACCOUNT",
  "JOBS",
  "EMPLOYER",
  "TRUST_SAFETY",
  "TECHNICAL",
  "FEEDBACK",
  "PARTNERSHIP",
  "PRIVACY",
  "OTHER",
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export type SupportStatus = "OPEN" | "PENDING" | "RESOLVED";
export type SupportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface CreateTicketInput {
  name: string;
  email: string;
  topic: SupportTopic;
  subject?: string;
  message: string;
  locale?: SupportedLocale;
  pageUrl?: string;
  botShield: { website: string; startedAt: number };
}

export interface MyTicket {
  id: string;
  reference: string;
  topic: SupportTopic;
  subject: string | null;
  message: string;
  status: SupportStatus;
  createdAt: string;
  lastReplyAt: string | null;
  replies: { id: string; body: string; createdAt: string }[];
}

export interface AdminTicketPerson {
  id: string;
  name: string | null;
  email: string;
}

export interface AdminTicket {
  id: string;
  reference: string;
  name: string;
  email: string;
  topic: SupportTopic;
  subject: string | null;
  message: string;
  status: SupportStatus;
  priority: SupportPriority;
  userId: string | null;
  userRole: string | null;
  locale: string | null;
  internalNotes?: string | null;
  pageUrl?: string | null;
  firstResponseAt: string | null;
  lastReplyAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: AdminTicketPerson | null;
  _count?: { replies: number };
  replies?: { id: string; body: string; emailSent: boolean; createdAt: string; author: { id: string; name: string | null } | null }[];
}

export interface AdminTicketList {
  tickets: AdminTicket[];
  counts: Record<SupportStatus, number>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminTicketFilters {
  status?: SupportStatus;
  priority?: SupportPriority;
  topic?: SupportTopic;
  assigneeId?: string;
  q?: string;
  page?: number;
}

export interface AdminTicketUpdate {
  status?: SupportStatus;
  priority?: SupportPriority;
  topic?: SupportTopic;
  assigneeId?: string | null;
  internalNotes?: string | null;
}

export const support = {
  createTicket: (data: CreateTicketInput) =>
    fetchAPI<{ ticket: { id: string; reference: string; status: SupportStatus; createdAt: string }; message: string }>(
      "/api/support/tickets",
      { method: "POST", body: JSON.stringify(data) },
    ),
  myTickets: () => fetchAPI<{ tickets: MyTicket[] }>("/api/support/tickets/mine"),
};

export const adminSupport = {
  list: (filters: AdminTicketFilters = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
    const q = sp.toString();
    return fetchAPI<AdminTicketList>(`/api/admin/support/tickets${q ? `?${q}` : ""}`);
  },
  get: (id: string) => fetchAPI<{ ticket: AdminTicket }>(`/api/admin/support/tickets/${encodeURIComponent(id)}`),
  update: (id: string, data: AdminTicketUpdate) =>
    fetchAPI<{ ticket: AdminTicket }>(`/api/admin/support/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  reply: (id: string, body: string, status?: SupportStatus) =>
    fetchAPI<{ delivery: { email: boolean; inApp: boolean } }>(
      `/api/admin/support/tickets/${encodeURIComponent(id)}/replies`,
      { method: "POST", body: JSON.stringify({ body, ...(status ? { status } : {}) }) },
    ),
  assignees: () => fetchAPI<{ assignees: AdminTicketPerson[] }>("/api/admin/support/assignees"),
};

// ── Company reviews ──────────────────────────────────────────────────────────

export interface CompanyReviewInput {
  overallRating: number;
  cultureRating?: number;
  salaryRating?: number;
  workLifeRating?: number;
  managementRating?: number;
  growthRating?: number;
  title: string;
  pros: string;
  cons: string;
  advice?: string;
  isCurrentEmployee?: boolean;
  jobTitle?: string;
}

export interface HelpfulVoteResult {
  success: boolean;
  voted: boolean;
  alreadyVoted?: boolean;
  helpfulCount: number;
}

export const companyReviews = {
  submit: (companyId: string, data: CompanyReviewInput) =>
    fetchAPI<{ review: { id: string }; message: string }>(
      `/api/companies/${encodeURIComponent(companyId)}/reviews`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  markHelpful: (companyId: string, reviewId: string) =>
    fetchAPI<HelpfulVoteResult>(
      `/api/companies/${encodeURIComponent(companyId)}/reviews/${encodeURIComponent(reviewId)}/helpful`,
      { method: "POST" },
    ),
  unmarkHelpful: (companyId: string, reviewId: string) =>
    fetchAPI<HelpfulVoteResult>(
      `/api/companies/${encodeURIComponent(companyId)}/reviews/${encodeURIComponent(reviewId)}/helpful`,
      { method: "DELETE" },
    ),
  listVotes: (companyId: string) =>
    fetchAPI<{ reviews: { id: string; votedByViewer: boolean; helpfulCount: number }[] }>(
      `/api/companies/${encodeURIComponent(companyId)}/reviews?limit=50`,
    ),
};

export const adminReviews = {
  moderate: (reviewId: string, action: "approve" | "reject") =>
    fetchAPI<{ id: string; isApproved: boolean }>(`/api/admin/reviews/${encodeURIComponent(reviewId)}/moderate`, {
      method: "PUT",
      body: JSON.stringify({ action }),
    }),
};
