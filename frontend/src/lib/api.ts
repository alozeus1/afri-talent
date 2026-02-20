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

// Jobs
export const jobs = {
  list: (params?: JobListParams) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.location) searchParams.set("location", params.location);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.seniority) searchParams.set("seniority", params.seniority);
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

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "CANDIDATE" | "EMPLOYER";
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
  tags: string[];
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

export interface UserListResponse {
  users: Array<User & { createdAt: string; _count: { applications: number } }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
