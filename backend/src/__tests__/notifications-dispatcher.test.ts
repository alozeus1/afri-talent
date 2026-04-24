import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  welcomeEmail: vi.fn(async (_opts: any) => undefined),
  accountClosedEmail: vi.fn(async (_opts: any) => undefined),
  applicationStatusEmail: vi.fn(async (_opts: any) => undefined),
  passwordResetEmail: vi.fn(async (_opts: any) => undefined),
}));
const notificationMocks = vi.hoisted(() => ({
  createUserNotification: vi.fn(async (_input: any) => ({ id: "n1" })),
}));
const opsMocks = vi.hoisted(() => ({
  recordOpsEvent: vi.fn(),
}));

vi.mock("../lib/email.js", () => emailMocks);
vi.mock("../lib/notifications.js", () => notificationMocks);
vi.mock("../lib/ops/events.js", () => opsMocks);
vi.mock("../lib/logger.js", () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { dispatch } from "../lib/notifications/dispatcher.js";

beforeEach(() => {
  Object.values(emailMocks).forEach((m) => m.mockClear());
  notificationMocks.createUserNotification.mockClear();
  opsMocks.recordOpsEvent.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification dispatcher", () => {
  it("ACCOUNT_REGISTERED sends welcome email + in-app row for candidates", async () => {
    const result = await dispatch({
      kind: "ACCOUNT_REGISTERED",
      user: { id: "u1", email: "a@b.com", name: "Ada", role: "CANDIDATE" },
      appUrl: "https://app.test",
    });

    expect(emailMocks.welcomeEmail).toHaveBeenCalledOnce();
    const welcomeArgs = emailMocks.welcomeEmail.mock.calls[0]?.[0];
    expect(welcomeArgs).toMatchObject({ to: "a@b.com", role: "CANDIDATE" });
    expect(notificationMocks.createUserNotification).toHaveBeenCalledOnce();
    const inAppArgs = notificationMocks.createUserNotification.mock.calls[0]?.[0];
    expect(inAppArgs).toMatchObject({ userId: "u1", type: "ACCOUNT_REGISTERED" });
    expect(result.outcomes.every((o) => o.delivered)).toBe(true);
  });

  it("ACCOUNT_REGISTERED uses employer copy for employer role", async () => {
    await dispatch({
      kind: "ACCOUNT_REGISTERED",
      user: { id: "u2", email: "e@b.com", name: "Acme", role: "EMPLOYER" },
      appUrl: "https://app.test",
    });

    expect(emailMocks.welcomeEmail.mock.calls[0]?.[0].role).toBe("EMPLOYER");
    expect(
      String(notificationMocks.createUserNotification.mock.calls[0]?.[0].body),
    ).toContain("employer");
  });

  it("ACCOUNT_CLOSED sends closure email and in-app notification with deletion window", async () => {
    await dispatch({
      kind: "ACCOUNT_CLOSED",
      user: { id: "u3", email: "x@b.com", name: "Bob" },
      scheduledDeletionDays: 30,
      supportUrl: "https://support",
    });

    expect(emailMocks.accountClosedEmail).toHaveBeenCalledOnce();
    expect(emailMocks.accountClosedEmail.mock.calls[0]?.[0].scheduledDeletionDays).toBe(30);
    expect(notificationMocks.createUserNotification).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].type).toBe("ACCOUNT_CLOSED");
  });

  it("PASSWORD_RESET_REQUESTED sends only the email (no in-app)", async () => {
    await dispatch({
      kind: "PASSWORD_RESET_REQUESTED",
      user: { id: "u4", email: "x@b.com", name: "Cara" },
      resetUrl: "https://app.test/reset?t=abc",
      expiresInHours: 1,
    });

    expect(emailMocks.passwordResetEmail).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
  });

  it("APPLICATION_STATUS_CHANGED sends email + in-app with metadata", async () => {
    await dispatch({
      kind: "APPLICATION_STATUS_CHANGED",
      candidate: { id: "u5", email: "c@b.com", name: "Dee" },
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      status: "SHORTLISTED",
      jobUrl: "https://app.test/applications/app-1",
      applicationId: "app-1",
      jobId: "job-1",
    });

    expect(emailMocks.applicationStatusEmail).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].metadata).toMatchObject({
      applicationId: "app-1",
      jobId: "job-1",
      status: "SHORTLISTED",
    });
  });

  it("returns successfully even when a channel throws", async () => {
    emailMocks.welcomeEmail.mockRejectedValueOnce(new Error("SES outage"));

    const result = await dispatch({
      kind: "ACCOUNT_REGISTERED",
      user: { id: "u6", email: "f@b.com", name: "Eve", role: "CANDIDATE" },
      appUrl: "https://app.test",
    });

    const email = result.outcomes.find((o) => o.channel === "email");
    const inApp = result.outcomes.find((o) => o.channel === "in_app");
    expect(email?.delivered).toBe(false);
    expect(email?.reason).toContain("SES outage");
    expect(inApp?.delivered).toBe(true);
  });
});
