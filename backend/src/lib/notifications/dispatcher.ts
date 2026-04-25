/**
 * Unified notification dispatcher.
 *
 * Phase 1+: orchestrates email + in-app + sms fan-out for lifecycle events.
 *   - Each event has a declarative policy (channels + template + preference key).
 *   - Security events (PASSWORD_CHANGED, OTP, etc.) bypass non-security prefs.
 *   - Per-channel failures push a dead letter and emit a delivery_failure metric.
 *   - Preference-disabled channels emit a delivery_skipped metric instead.
 *
 * The dispatcher always returns successfully; per-channel failures are logged
 * and never crash the caller.
 */
import type { NotificationType } from "@prisma/client";
import logger from "../logger.js";
import { recordOpsEvent } from "../ops/events.js";
import { pushDeadLetter } from "../ops/resilience.js";
import prisma from "../prisma.js";
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

type PreferenceKey =
  | NotificationChannel
  | "smsEnabled"
  | "marketing"
  | "securityAlerts";

type PreferenceFlags = Record<PreferenceKey, boolean>;

const DEFAULT_PREFS: PreferenceFlags = {
  savedSearchAlerts: true,
  weeklyDigests: true,
  applicationReminders: true,
  profileCompletionNudges: true,
  verificationCompletionNudges: true,
  visaRelocationAlerts: true,
  salaryInsights: true,
  interviewPrepRecommendations: true,
  interviewReminders: true,
  applicationUpdates: true,
  subscriptionNotices: true,
  smsEnabled: true,
  marketing: false,
  securityAlerts: true,
};

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

type Channel = "email" | "in_app" | "push" | "sms";

interface ChannelOutcome {
  channel: Channel;
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

function maskEmailDomain(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1) : "unknown";
}

function extractRecipientUserId(event: DispatchableEvent): string {
  switch (event.kind) {
    case "APPLICATION_STATUS_CHANGED":
      return event.candidate.id;
    case "NEW_APPLICATION":
    case "JOB_PUBLISHED":
      return event.employer.userId;
    default:
      return event.user.id;
  }
}

async function loadUserPreferences(userId: string): Promise<PreferenceFlags> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!pref) return { ...DEFAULT_PREFS };

    const merged: PreferenceFlags = { ...DEFAULT_PREFS };
    for (const key of Object.keys(DEFAULT_PREFS) as PreferenceKey[]) {
      const value = (pref as unknown as Record<string, unknown>)[key];
      if (typeof value === "boolean") {
        merged[key] = value;
      }
    }
    return merged;
  } catch (error) {
    logger.warn(
      { error, userId },
      "[notifications.dispatch] failed to load preferences; using defaults",
    );
    return { ...DEFAULT_PREFS };
  }
}

interface DispatchChannelOpts {
  channel: Channel;
  eventKind: DispatchableEvent["kind"];
  isSecurityEvent: boolean;
  prefKey: PreferenceKey | null;
  prefs: PreferenceFlags;
  recipientUserId: string;
  template: string;
  recipientHint?: string;
  send: () => Promise<void>;
}

async function dispatchChannel(opts: DispatchChannelOpts): Promise<ChannelOutcome> {
  const { channel, eventKind, isSecurityEvent, prefKey, prefs, recipientUserId, template, recipientHint, send } =
    opts;

  if (!isSecurityEvent && prefKey && prefs[prefKey] === false) {
    logger.debug(
      { channel, eventKind, prefKey, recipientUserId },
      "[notifications.dispatch] channel skipped due to user preference",
    );
    recordOpsEvent({
      metricName: "notification_delivery_skipped",
      category: "notifications",
      details: {
        channel,
        type: eventKind,
        template,
        reason: "preference_disabled",
        pref_key: prefKey,
      },
    });
    return { channel, delivered: false, reason: "preference_disabled" };
  }

  try {
    await send();
    recordOpsEvent({
      metricName: "notification_delivery_success",
      category: "notifications",
      details: {
        channel,
        type: eventKind,
        template,
        ...(recipientHint ? { recipient_hint: recipientHint } : {}),
      },
    });
    return { channel, delivered: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    logger.warn(
      { channel, reason, eventKind, recipientUserId },
      "[notifications.dispatch] channel delivery failed",
    );
    recordOpsEvent({
      metricName: "notification_delivery_failure",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: {
        channel,
        type: eventKind,
        template,
        reason,
        ...(recipientHint ? { recipient_hint: recipientHint } : {}),
      },
    });
    try {
      await pushDeadLetter({
        category: "notification",
        source: `dispatcher_${eventKind.toLowerCase()}_${channel}`,
        reasonCode: "channel_delivery_failed",
        retryable: true,
        error,
        payload: {
          event: eventKind,
          channel,
          template,
          recipientUserId,
          recipientHint,
        },
      });
    } catch (dlqError) {
      logger.warn(
        { dlqError, eventKind, channel },
        "[notifications.dispatch] failed to push dead letter",
      );
    }
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
  const recipientUserId = extractRecipientUserId(event);
  const prefs = await loadUserPreferences(recipientUserId);
  const outcomes: ChannelOutcome[] = [];

  const inAppPrefKey: PreferenceKey | null = policy.inAppChannel ?? null;

  switch (event.kind) {
    case "ACCOUNT_REGISTERED": {
      const recipientHint = maskEmailDomain(event.user.email);
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "welcome",
          recipientHint,
          send: () =>
            welcomeEmail({
              to: event.user.email,
              userName: event.user.name,
              role: event.user.role,
              appUrl: event.appUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "welcome_inapp",
            send: () =>
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
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "ACCOUNT_CLOSED": {
      const recipientHint = maskEmailDomain(event.user.email);
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "account_closed",
          recipientHint,
          send: () =>
            accountClosedEmail({
              to: event.user.email,
              userName: event.user.name,
              scheduledDeletionDays: event.scheduledDeletionDays,
              supportUrl: event.supportUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "account_closed_inapp",
            send: () =>
              createUserNotification({
                userId: event.user.id,
                type: policy.notificationType!,
                title: "Account closure scheduled",
                body: `Your account will be permanently deleted in ${event.scheduledDeletionDays} days. Sign in to cancel.`,
                channel: policy.inAppChannel,
                metadata: { scheduledDeletionDays: event.scheduledDeletionDays },
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "PASSWORD_RESET_REQUESTED": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: null,
          prefs,
          recipientUserId,
          template: "password_reset",
          recipientHint: maskEmailDomain(event.user.email),
          send: () =>
            passwordResetEmail({
              to: event.user.email,
              userName: event.user.name,
              resetUrl: event.resetUrl,
              expiresInHours: event.expiresInHours,
            }),
        }),
      );
      break;
    }
    case "APPLICATION_STATUS_CHANGED": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "application_status",
          recipientHint: maskEmailDomain(event.candidate.email),
          send: () =>
            applicationStatusEmail({
              to: event.candidate.email,
              candidateName: event.candidate.name,
              jobTitle: event.jobTitle,
              companyName: event.companyName,
              status: event.status,
              jobUrl: event.jobUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "application_status_inapp",
            send: () =>
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
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "PHONE_OTP_REQUESTED": {
      const message = `Your AfriTalent verification code is ${event.otpCode}. It expires in ${event.expiresInMinutes} minutes. Do not share this code.`;
      outcomes.push(
        await dispatchChannel({
          channel: "sms",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: null,
          prefs,
          recipientUserId,
          template: "phone_otp",
          recipientHint: maskPhone(event.phoneNumber),
          send: async () => {
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
          },
        }),
      );
      break;
    }
    case "PHONE_VERIFIED": {
      const masked = maskPhone(event.phoneNumber);
      outcomes.push(
        await dispatchChannel({
          channel: "sms",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: "smsEnabled",
          prefs,
          recipientUserId,
          template: "phone_verified",
          recipientHint: masked,
          send: async () => {
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
          },
        }),
      );
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "phone_verified",
          recipientHint: maskEmailDomain(event.user.email),
          send: () =>
            phoneVerifiedEmail({
              to: event.user.email,
              userName: event.user.name,
              phoneMasked: masked,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "phone_verified_inapp",
            send: () =>
              createUserNotification({
                userId: event.user.id,
                type: policy.notificationType!,
                title: "Phone number verified",
                body: `Your phone number ending in ${masked} is now verified.`,
                channel: policy.inAppChannel,
                metadata: { phoneMasked: masked },
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "PASSWORD_CHANGED": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "password_changed",
          recipientHint: maskEmailDomain(event.user.email),
          send: () =>
            passwordChangedEmail({
              to: event.user.email,
              userName: event.user.name,
              changedAt: event.changedAt,
              supportUrl: event.supportUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "password_changed_inapp",
            send: () =>
              createUserNotification({
                userId: event.user.id,
                type: policy.notificationType!,
                title: "Password changed",
                body: "Your AfriTalent password was changed. If this wasn't you, contact support immediately.",
                channel: policy.inAppChannel,
                metadata: { changedAt: event.changedAt.toISOString() },
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "EMAIL_VERIFIED": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "email_verified",
          recipientHint: maskEmailDomain(event.user.email),
          send: () =>
            emailVerifiedEmail({
              to: event.user.email,
              userName: event.user.name,
              appUrl: event.appUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "email_verified_inapp",
            send: () =>
              createUserNotification({
                userId: event.user.id,
                type: policy.notificationType!,
                title: "Email verified",
                body: "Your email address is now verified. You have full access to AfriTalent.",
                channel: policy.inAppChannel,
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "NEW_APPLICATION": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "new_application",
          recipientHint: maskEmailDomain(event.employer.email),
          send: () =>
            newApplicationEmail({
              to: event.employer.email,
              employerName: event.employer.name,
              candidateName: event.candidateName,
              jobTitle: event.jobTitle,
              applicationUrl: event.applicationUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "new_application_inapp",
            send: () =>
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
              }).then(() => undefined),
          }),
        );
      }
      break;
    }
    case "JOB_PUBLISHED": {
      outcomes.push(
        await dispatchChannel({
          channel: "email",
          eventKind: event.kind,
          isSecurityEvent: policy.isSecurityEvent,
          prefKey: inAppPrefKey,
          prefs,
          recipientUserId,
          template: "job_published",
          recipientHint: maskEmailDomain(event.employer.email),
          send: () =>
            jobPublishedEmail({
              to: event.employer.email,
              employerName: event.employer.name,
              jobTitle: event.jobTitle,
              jobUrl: event.jobUrl,
            }),
        }),
      );
      if (policy.notificationType && policy.inAppChannel) {
        outcomes.push(
          await dispatchChannel({
            channel: "in_app",
            eventKind: event.kind,
            isSecurityEvent: policy.isSecurityEvent,
            prefKey: inAppPrefKey,
            prefs,
            recipientUserId,
            template: "job_published_inapp",
            send: () =>
              createUserNotification({
                userId: event.employer.userId,
                type: policy.notificationType!,
                title: "Your job is now live",
                body: `${event.jobTitle} is published and visible to candidates.`,
                channel: policy.inAppChannel,
                metadata: { jobId: event.jobId },
              }).then(() => undefined),
          }),
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
      skipped: outcomes.filter((o) => !o.delivered && o.reason === "preference_disabled").length,
      failed: outcomes.filter((o) => !o.delivered && o.reason !== "preference_disabled").length,
      total: outcomes.length,
      security: policy.isSecurityEvent,
    },
  });

  return { kind: event.kind, outcomes };
}

export const __testing = { EVENT_POLICY, DEFAULT_PREFS };
