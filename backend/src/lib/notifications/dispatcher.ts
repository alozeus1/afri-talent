/**
 * Unified notification dispatcher.
 *
 * Phase 1: orchestrates email + in-app + web-push fan-out for lifecycle events.
 *   - SMS adapter is intentionally not wired yet (Phase 2).
 *   - Each event has a declarative policy (channels + template + preference key).
 *   - Security events (PASSWORD_CHANGED, MFA, etc.) bypass marketing prefs.
 *
 * The dispatcher always returns successfully; per-channel failures are logged
 * via existing email/push observability and do not crash the caller.
 */
import type { NotificationType } from "@prisma/client";
import logger from "../logger.js";
import { recordOpsEvent } from "../ops/events.js";
import {
  accountClosedEmail,
  applicationStatusEmail,
  emailVerifiedEmail,
  jobPublishedEmail,
  newApplicationEmail,
  passwordChangedEmail,
  passwordResetEmail,
  phoneVerifiedEmail,
  welcomeEmail,
} from "../email.js";
import {
  createUserNotification,
  type NotificationChannel,
} from "../notifications.js";
import { sendSms } from "../sms/africasTalking.js";

export type DispatchableEvent =
  | {
      kind: "ACCOUNT_REGISTERED";
      user: { id: string; email: string; name: string; role: "CANDIDATE" | "EMPLOYER" | "ADMIN" };
      appUrl: string;
    }
  | {
      kind: "ACCOUNT_CLOSED";
      user: { id: string; email: string; name: string };
      scheduledDeletionDays: number;
      supportUrl: string;
    }
  | {
      kind: "PASSWORD_RESET_REQUESTED";
      user: { id: string; email: string; name: string };
      resetUrl: string;
      expiresInHours: number;
    }
  | {
      kind: "APPLICATION_STATUS_CHANGED";
      candidate: { id: string; email: string; name: string };
      jobTitle: string;
      companyName: string;
      status: string;
      jobUrl: string;
      applicationId: string;
      jobId: string;
    }
  | {
      kind: "PHONE_OTP_REQUESTED";
      user: { id: string; name: string };
      phoneNumber: string;
      otpCode: string;
      expiresInMinutes: number;
    }
  | {
      kind: "PHONE_VERIFIED";
      user: { id: string; email: string; name: string };
      phoneNumber: string;
    }
  | {
      kind: "PASSWORD_CHANGED";
      user: { id: string; email: string; name: string };
      changedAt: Date;
      supportUrl: string;
    }
  | {
      kind: "EMAIL_VERIFIED";
      user: { id: string; email: string; name: string };
      appUrl: string;
    }
  | {
      kind: "NEW_APPLICATION";
      employer: { userId: string; email: string; name: string };
      candidateName: string;
      jobTitle: string;
      jobId: string;
      applicationId: string;
      applicationUrl: string;
    }
  | {
      kind: "JOB_PUBLISHED";
      employer: { userId: string; email: string; name: string };
      jobTitle: string;
      jobId: string;
      jobUrl: string;
    };

interface ChannelOutcome {
  channel: "email" | "in_app" | "push" | "sms";
  delivered: boolean;
  reason?: string;
}

interface EventPolicy {
  notificationType?: NotificationType;
  inAppChannel?: NotificationChannel;
  isSecurityEvent: boolean;
}

const EVENT_POLICY: Record<DispatchableEvent["kind"], EventPolicy> = {
  ACCOUNT_REGISTERED: {
    notificationType: "ACCOUNT_REGISTERED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: false,
  },
  ACCOUNT_CLOSED: {
    notificationType: "ACCOUNT_CLOSED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: true,
  },
  PASSWORD_RESET_REQUESTED: {
    isSecurityEvent: true,
  },
  APPLICATION_STATUS_CHANGED: {
    notificationType: "APPLICATION_STATUS",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: false,
  },
  PHONE_OTP_REQUESTED: {
    isSecurityEvent: true,
  },
  PHONE_VERIFIED: {
    notificationType: "PHONE_VERIFIED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: true,
  },
  PASSWORD_CHANGED: {
    notificationType: "PASSWORD_CHANGED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: true,
  },
  EMAIL_VERIFIED: {
    notificationType: "EMAIL_VERIFIED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: true,
  },
  NEW_APPLICATION: {
    notificationType: "NEW_APPLICATION",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: false,
  },
  JOB_PUBLISHED: {
    notificationType: "JOB_PUBLISHED",
    inAppChannel: "applicationUpdates",
    isSecurityEvent: false,
  },
};

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  return digits.slice(-4);
}

async function safeSend<T>(
  channel: ChannelOutcome["channel"],
  fn: () => Promise<T>,
): Promise<ChannelOutcome> {
  try {
    await fn();
    return { channel, delivered: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    logger.warn({ channel, reason }, "[notifications.dispatch] channel delivery failed");
    return { channel, delivered: false, reason };
  }
}

/**
 * Fan an event out to its declared channels. Always resolves; never throws.
 */
export async function dispatch(
  event: DispatchableEvent,
): Promise<{ kind: DispatchableEvent["kind"]; outcomes: ChannelOutcome[] }> {
  const policy = EVENT_POLICY[event.kind];
  const outcomes: ChannelOutcome[] = [];

  switch (event.kind) {
    case "ACCOUNT_REGISTERED": {
      outcomes.push(
        await safeSend("email", () =>
          welcomeEmail({
            to: event.user.email,
            userName: event.user.name,
            role: event.user.role,
            appUrl: event.appUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.user.id,
              type: policy.notificationType!,
              title: "Welcome to AfriTalent",
              body:
                event.user.role === "EMPLOYER"
                  ? "Your employer account is ready. Post a job to get started."
                  : "Your account is ready. Complete your profile to start matching with global roles.",
              channel: policy.inAppChannel,
              metadata: { role: event.user.role },
            }),
          ),
        );
      }
      break;
    }
    case "ACCOUNT_CLOSED": {
      outcomes.push(
        await safeSend("email", () =>
          accountClosedEmail({
            to: event.user.email,
            userName: event.user.name,
            scheduledDeletionDays: event.scheduledDeletionDays,
            supportUrl: event.supportUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.user.id,
              type: policy.notificationType!,
              title: "Account closure scheduled",
              body: `Your account will be permanently deleted in ${event.scheduledDeletionDays} days. Sign in to cancel.`,
              channel: policy.inAppChannel,
              metadata: { scheduledDeletionDays: event.scheduledDeletionDays },
            }),
          ),
        );
      }
      break;
    }
    case "PASSWORD_RESET_REQUESTED": {
      outcomes.push(
        await safeSend("email", () =>
          passwordResetEmail({
            to: event.user.email,
            userName: event.user.name,
            resetUrl: event.resetUrl,
            expiresInHours: event.expiresInHours,
          }),
        ),
      );
      break;
    }
    case "APPLICATION_STATUS_CHANGED": {
      outcomes.push(
        await safeSend("email", () =>
          applicationStatusEmail({
            to: event.candidate.email,
            candidateName: event.candidate.name,
            jobTitle: event.jobTitle,
            companyName: event.companyName,
            status: event.status,
            jobUrl: event.jobUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.candidate.id,
              type: policy.notificationType!,
              title: "Application status updated",
              body: `Your application for ${event.jobTitle} is now ${event.status.toLowerCase()}.`,
              channel: policy.inAppChannel,
              metadata: {
                applicationId: event.applicationId,
                jobId: event.jobId,
                status: event.status,
              },
            }),
          ),
        );
      }
      break;
    }
    case "PHONE_OTP_REQUESTED": {
      const message = `Your AfriTalent verification code is ${event.otpCode}. It expires in ${event.expiresInMinutes} minutes. Do not share this code.`;
      outcomes.push(
        await safeSend("sms", async () => {
          const result = await sendSms({
            to: event.phoneNumber,
            message,
            template: "phone_otp",
            userId: event.user.id,
            metadata: { expiresInMinutes: event.expiresInMinutes },
          });
          if (!result.delivered) {
            throw new Error(result.errorMessage ?? result.errorCode ?? "sms_not_delivered");
          }
        }),
      );
      break;
    }
    case "PHONE_VERIFIED": {
      const masked = maskPhone(event.phoneNumber);
      outcomes.push(
        await safeSend("sms", async () => {
          const result = await sendSms({
            to: event.phoneNumber,
            message:
              "Your AfriTalent phone number is verified. If this wasn't you, reset your password and contact support.",
            template: "phone_verified",
            userId: event.user.id,
          });
          if (!result.delivered && result.status !== "SKIPPED") {
            throw new Error(result.errorMessage ?? result.errorCode ?? "sms_not_delivered");
          }
        }),
      );
      outcomes.push(
        await safeSend("email", () =>
          phoneVerifiedEmail({
            to: event.user.email,
            userName: event.user.name,
            phoneMasked: masked,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.user.id,
              type: policy.notificationType!,
              title: "Phone number verified",
              body: `Your phone number ending in ${masked} is now verified.`,
              channel: policy.inAppChannel,
              metadata: { phoneMasked: masked },
            }),
          ),
        );
      }
      break;
    }
    case "PASSWORD_CHANGED": {
      outcomes.push(
        await safeSend("email", () =>
          passwordChangedEmail({
            to: event.user.email,
            userName: event.user.name,
            changedAt: event.changedAt,
            supportUrl: event.supportUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.user.id,
              type: policy.notificationType!,
              title: "Password changed",
              body: "Your AfriTalent password was changed. If this wasn't you, contact support immediately.",
              channel: policy.inAppChannel,
              metadata: { changedAt: event.changedAt.toISOString() },
            }),
          ),
        );
      }
      break;
    }
    case "EMAIL_VERIFIED": {
      outcomes.push(
        await safeSend("email", () =>
          emailVerifiedEmail({
            to: event.user.email,
            userName: event.user.name,
            appUrl: event.appUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.user.id,
              type: policy.notificationType!,
              title: "Email verified",
              body: "Your email address is now verified. You have full access to AfriTalent.",
              channel: policy.inAppChannel,
            }),
          ),
        );
      }
      break;
    }
    case "NEW_APPLICATION": {
      outcomes.push(
        await safeSend("email", () =>
          newApplicationEmail({
            to: event.employer.email,
            employerName: event.employer.name,
            candidateName: event.candidateName,
            jobTitle: event.jobTitle,
            applicationUrl: event.applicationUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.employer.userId,
              type: policy.notificationType!,
              title: "New job application received",
              body: `${event.candidateName} applied for ${event.jobTitle}.`,
              channel: policy.inAppChannel,
              metadata: {
                applicationId: event.applicationId,
                jobId: event.jobId,
              },
            }),
          ),
        );
      }
      break;
    }
    case "JOB_PUBLISHED": {
      outcomes.push(
        await safeSend("email", () =>
          jobPublishedEmail({
            to: event.employer.email,
            employerName: event.employer.name,
            jobTitle: event.jobTitle,
            jobUrl: event.jobUrl,
          }),
        ),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await safeSend("in_app", () =>
            createUserNotification({
              userId: event.employer.userId,
              type: policy.notificationType!,
              title: "Your job is now live",
              body: `${event.jobTitle} is published and visible to candidates.`,
              channel: policy.inAppChannel,
              metadata: { jobId: event.jobId },
            }),
          ),
        );
      }
      break;
    }
  }

  recordOpsEvent({
    metricName: "notification_dispatch",
    category: "notifications",
    details: {
      event: event.kind,
      delivered: outcomes.filter((o) => o.delivered).length,
      total: outcomes.length,
      security: policy.isSecurityEvent,
    },
  });

  return { kind: event.kind, outcomes };
}

export const __testing = { EVENT_POLICY };
