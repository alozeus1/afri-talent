import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emailMocks = vi.hoisted(() => ({
  welcomeEmail: vi.fn(async (_opts: any) => undefined),
  accountClosedEmail: vi.fn(async (_opts: any) => undefined),
  applicationStatusEmail: vi.fn(async (_opts: any) => undefined),
  passwordResetEmail: vi.fn(async (_opts: any) => undefined),
  phoneVerifiedEmail: vi.fn(async (_opts: any) => undefined),
  passwordChangedEmail: vi.fn(async (_opts: any) => undefined),
  emailVerifiedEmail: vi.fn(async (_opts: any) => undefined),
  newApplicationEmail: vi.fn(async (_opts: any) => undefined),
  jobPublishedEmail: vi.fn(async (_opts: any) => undefined),
}));
const notificationMocks = vi.hoisted(() => ({
  createUserNotification: vi.fn(async (_input: any) => ({ id: "n1" })),
}));
const opsMocks = vi.hoisted(() => ({
  recordOpsEvent: vi.fn(),
}));
const resilienceMocks = vi.hoisted(() => ({
  pushDeadLetter: vi.fn(async (_input: any) => undefined),
  withRetry: vi.fn(async (op: any) => op()),
}));
const prismaMocks = vi.hoisted(() => ({
  default: {
    notificationPreference: {
      findUnique: vi.fn(async (_args: any): Promise<Record<string, unknown> | null> => null),
    },
  },
}));
const smsMocks = vi.hoisted(() => ({
  sendSms: vi.fn(
    async (_opts: any): Promise<{
      delivered: boolean;
      status: string;
      providerMsgId?: string;
      errorCode?: string;
      errorMessage?: string;
    }> => ({ delivered: true, status: "SENT", providerMsgId: "msg1" }),
  ),
}));

vi.mock("../lib/email.js", () => emailMocks);
vi.mock("../lib/notifications.js", () => notificationMocks);
vi.mock("../lib/ops/events.js", () => opsMocks);
vi.mock("../lib/ops/resilience.js", () => resilienceMocks);
vi.mock("../lib/prisma.js", () => prismaMocks);
vi.mock("../lib/sms/africasTalking.js", () => smsMocks);
vi.mock("../lib/logger.js", () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { dispatch } from "../lib/notifications/dispatcher.js";

beforeEach(() => {
  Object.values(emailMocks).forEach((m) => m.mockClear());
  notificationMocks.createUserNotification.mockClear();
  opsMocks.recordOpsEvent.mockClear();
  resilienceMocks.pushDeadLetter.mockClear();
  prismaMocks.default.notificationPreference.findUnique.mockClear();
  prismaMocks.default.notificationPreference.findUnique.mockImplementation(
    async (_args: any) => null,
  );
  smsMocks.sendSms.mockClear();
  smsMocks.sendSms.mockImplementation(async (_opts: any) => ({
    delivered: true,
    status: "SENT",
    providerMsgId: "msg1",
  }));
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

  it("PHONE_OTP_REQUESTED sends only an SMS containing the code", async () => {
    const result = await dispatch({
      kind: "PHONE_OTP_REQUESTED",
      user: { id: "u7", name: "Fola" },
      phoneNumber: "+2348012345678",
      otpCode: "123456",
      expiresInMinutes: 10,
    });

    expect(smsMocks.sendSms).toHaveBeenCalledOnce();
    const args = smsMocks.sendSms.mock.calls[0]?.[0];
    expect(args.template).toBe("phone_otp");
    expect(args.message).toContain("123456");
    expect(args.userId).toBe("u7");
    expect(emailMocks.welcomeEmail).not.toHaveBeenCalled();
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
    expect(result.outcomes.find((o) => o.channel === "sms")?.delivered).toBe(true);
  });

  it("PHONE_OTP_REQUESTED marks the SMS channel as failed when delivery fails", async () => {
    smsMocks.sendSms.mockImplementationOnce(async () => ({
      delivered: false,
      status: "FAILED",
      errorCode: "PROVIDER_REJECTED",
      errorMessage: "bad number",
    }));

    const result = await dispatch({
      kind: "PHONE_OTP_REQUESTED",
      user: { id: "u8", name: "Gabe" },
      phoneNumber: "+2348012345679",
      otpCode: "654321",
      expiresInMinutes: 10,
    });

    const sms = result.outcomes.find((o) => o.channel === "sms");
    expect(sms?.delivered).toBe(false);
    expect(sms?.reason).toContain("bad number");
  });

  it("PHONE_VERIFIED fans out to SMS, email, and in-app", async () => {
    const result = await dispatch({
      kind: "PHONE_VERIFIED",
      user: { id: "u9", email: "h@b.com", name: "Hadiza" },
      phoneNumber: "+2348011112233",
    });

    expect(smsMocks.sendSms).toHaveBeenCalledOnce();
    expect(smsMocks.sendSms.mock.calls[0]?.[0].template).toBe("phone_verified");
    expect(emailMocks.phoneVerifiedEmail).toHaveBeenCalledOnce();
    expect(emailMocks.phoneVerifiedEmail.mock.calls[0]?.[0].phoneMasked).toBe("2233");
    expect(notificationMocks.createUserNotification).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].type).toBe("PHONE_VERIFIED");
    expect(result.outcomes.length).toBe(3);
  });

  it("PHONE_VERIFIED treats SKIPPED SMS (provider unconfigured) as a non-error", async () => {
    smsMocks.sendSms.mockImplementationOnce(async () => ({
      delivered: false,
      status: "SKIPPED",
      errorCode: "PROVIDER_UNCONFIGURED",
    }));

    const result = await dispatch({
      kind: "PHONE_VERIFIED",
      user: { id: "u10", email: "i@b.com", name: "Idris" },
      phoneNumber: "+2348099887766",
    });

    const sms = result.outcomes.find((o) => o.channel === "sms");
    expect(sms?.delivered).toBe(true); // SKIPPED is not treated as failure
    expect(emailMocks.phoneVerifiedEmail).toHaveBeenCalledOnce();
  });

  it("PASSWORD_CHANGED sends security email + in-app notification", async () => {
    const changedAt = new Date("2026-04-24T10:00:00Z");
    await dispatch({
      kind: "PASSWORD_CHANGED",
      user: { id: "u11", email: "j@b.com", name: "Jamil" },
      changedAt,
      supportUrl: "https://app.test/support",
    });

    expect(emailMocks.passwordChangedEmail).toHaveBeenCalledOnce();
    expect(emailMocks.passwordChangedEmail.mock.calls[0]?.[0]).toMatchObject({
      to: "j@b.com",
      changedAt,
      supportUrl: "https://app.test/support",
    });
    expect(notificationMocks.createUserNotification).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].type).toBe(
      "PASSWORD_CHANGED",
    );
  });

  it("EMAIL_VERIFIED sends confirmation email + in-app notification", async () => {
    await dispatch({
      kind: "EMAIL_VERIFIED",
      user: { id: "u12", email: "k@b.com", name: "Kemi" },
      appUrl: "https://app.test",
    });

    expect(emailMocks.emailVerifiedEmail).toHaveBeenCalledOnce();
    expect(emailMocks.emailVerifiedEmail.mock.calls[0]?.[0].to).toBe("k@b.com");
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].type).toBe(
      "EMAIL_VERIFIED",
    );
  });

  it("NEW_APPLICATION notifies the employer (email + in-app) with metadata", async () => {
    await dispatch({
      kind: "NEW_APPLICATION",
      employer: { userId: "emp-1", email: "hr@acme.com", name: "Acme HR" },
      candidateName: "Lola",
      jobTitle: "Backend Engineer",
      jobId: "job-1",
      applicationId: "app-99",
      applicationUrl: "https://app.test/employer/applications/app-99",
    });

    expect(emailMocks.newApplicationEmail).toHaveBeenCalledOnce();
    expect(emailMocks.newApplicationEmail.mock.calls[0]?.[0]).toMatchObject({
      to: "hr@acme.com",
      candidateName: "Lola",
      jobTitle: "Backend Engineer",
    });
    const inApp = notificationMocks.createUserNotification.mock.calls[0]?.[0];
    expect(inApp.userId).toBe("emp-1");
    expect(inApp.type).toBe("NEW_APPLICATION");
    expect(inApp.metadata).toMatchObject({ applicationId: "app-99", jobId: "job-1" });
  });

  it("JOB_PUBLISHED notifies the employer with the live job URL", async () => {
    await dispatch({
      kind: "JOB_PUBLISHED",
      employer: { userId: "emp-2", email: "hire@acme.com", name: "Acme" },
      jobTitle: "Senior PM",
      jobId: "job-2",
      jobUrl: "https://app.test/jobs/senior-pm",
    });

    expect(emailMocks.jobPublishedEmail).toHaveBeenCalledOnce();
    expect(emailMocks.jobPublishedEmail.mock.calls[0]?.[0].jobUrl).toBe(
      "https://app.test/jobs/senior-pm",
    );
    expect(notificationMocks.createUserNotification.mock.calls[0]?.[0].type).toBe(
      "JOB_PUBLISHED",
    );
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

  it("skips a non-security channel when the user disabled the relevant preference", async () => {
    prismaMocks.default.notificationPreference.findUnique.mockImplementationOnce(
      async () => ({ applicationUpdates: false }),
    );

    const result = await dispatch({
      kind: "APPLICATION_STATUS_CHANGED",
      candidate: { id: "u-pref-1", email: "p@b.com", name: "Pia" },
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      status: "INTERVIEW",
      jobUrl: "https://app.test/applications/app-1",
      applicationId: "app-1",
      jobId: "job-1",
    });

    expect(emailMocks.applicationStatusEmail).not.toHaveBeenCalled();
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
    const email = result.outcomes.find((o) => o.channel === "email");
    const inApp = result.outcomes.find((o) => o.channel === "in_app");
    expect(email).toMatchObject({ delivered: false, reason: "preference_disabled" });
    expect(inApp).toMatchObject({ delivered: false, reason: "preference_disabled" });

    const skipMetric = opsMocks.recordOpsEvent.mock.calls.find(
      ([arg]) => (arg as any).metricName === "notification_delivery_skipped",
    );
    expect(skipMetric).toBeTruthy();
  });

  it("security events bypass user preference flags", async () => {
    prismaMocks.default.notificationPreference.findUnique.mockImplementationOnce(
      async () => ({
        applicationUpdates: false,
        marketing: false,
        smsEnabled: false,
        securityAlerts: false,
      }),
    );

    await dispatch({
      kind: "PASSWORD_CHANGED",
      user: { id: "u-pref-2", email: "q@b.com", name: "Quincy" },
      changedAt: new Date("2026-04-24T10:00:00Z"),
      supportUrl: "https://app.test/support",
    });

    expect(emailMocks.passwordChangedEmail).toHaveBeenCalledOnce();
    expect(notificationMocks.createUserNotification).toHaveBeenCalledOnce();
  });

  it("pushes a dead letter when a channel send fails", async () => {
    emailMocks.applicationStatusEmail.mockRejectedValueOnce(new Error("SES timeout"));

    const result = await dispatch({
      kind: "APPLICATION_STATUS_CHANGED",
      candidate: { id: "u-dlq-1", email: "r@b.com", name: "Rex" },
      jobTitle: "Backend Engineer",
      companyName: "Acme",
      status: "REJECTED",
      jobUrl: "https://app.test/applications/app-2",
      applicationId: "app-2",
      jobId: "job-2",
    });

    const email = result.outcomes.find((o) => o.channel === "email");
    expect(email?.delivered).toBe(false);
    expect(email?.reason).toContain("SES timeout");

    expect(resilienceMocks.pushDeadLetter).toHaveBeenCalledTimes(1);
    const dlqArg = resilienceMocks.pushDeadLetter.mock.calls[0]?.[0];
    expect(dlqArg).toMatchObject({
      category: "notification",
      source: "dispatcher_application_status_changed_email",
      reasonCode: "channel_delivery_failed",
    });
    expect(dlqArg.payload).toMatchObject({
      event: "APPLICATION_STATUS_CHANGED",
      channel: "email",
      template: "application_status",
      recipientUserId: "u-dlq-1",
    });

    const failureMetric = opsMocks.recordOpsEvent.mock.calls.find(
      ([arg]) => (arg as any).metricName === "notification_delivery_failure",
    );
    expect(failureMetric).toBeTruthy();
  });
});
