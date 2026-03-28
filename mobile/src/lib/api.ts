const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export interface MobileUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "CANDIDATE" | "EMPLOYER";
}

export interface MobileJob {
  id: string;
  slug: string;
  title: string;
  location: string;
  type: string;
  seniority: string;
  employer?: { companyName?: string | null };
  sourceName?: string | null;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ user: MobileUser; token?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiFetch<MobileUser>("/api/auth/me"),
  logout: () => apiFetch<{ message: string }>("/api/auth/logout", { method: "POST" }),
};

export const jobsApi = {
  list: () => apiFetch<{ jobs: MobileJob[]; pagination: { total: number } }>("/api/jobs?limit=20"),
  get: (slug: string) => apiFetch<MobileJob & { description: string }>(`/api/jobs/${slug}`),
};
