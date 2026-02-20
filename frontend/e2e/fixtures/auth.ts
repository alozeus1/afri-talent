import { APIRequestContext } from "@playwright/test";

/** Shared test credentials — seeded by backend/prisma/seed.ts */
export const TEST_CANDIDATE = {
  email: "candidate@example.com",
  password: "password123",
};

export const TEST_EMPLOYER = {
  email: "employer@example.com",
  password: "password123",
};

export const TEST_ADMIN = {
  email: "admin@example.com",
  password: "password123",
};

/** Base URL for the backend API (matches playwright.config.ts baseURL) */
export const API = process.env.API_BASE_URL ?? "http://localhost:4000";

/**
 * Login and return the Set-Cookie header string.
 * Playwright's APIRequestContext stores cookies automatically when
 * `storeCookies` is true (the default), so subsequent requests in the same
 * context will include the auth_token cookie automatically.
 */
export async function loginAs(
  request: APIRequestContext,
  creds: { email: string; password: string }
): Promise<void> {
  const res = await request.post(`${API}/api/auth/login`, {
    data: creds,
  });
  if (!res.ok()) {
    throw new Error(
      `Login failed (${res.status()}): ${await res.text()}`
    );
  }
}

/** Register a fresh user and return their ID (for isolation tests). */
export async function registerUser(
  request: APIRequestContext,
  opts: {
    email: string;
    password: string;
    name: string;
    role?: "CANDIDATE" | "EMPLOYER";
  }
): Promise<string> {
  const res = await request.post(`${API}/api/auth/register`, {
    data: {
      email: opts.email,
      password: opts.password,
      name: opts.name,
      role: opts.role ?? "CANDIDATE",
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Register failed (${res.status()}): ${await res.text()}`
    );
  }
  const body = await res.json();
  return body.user?.id as string;
}
