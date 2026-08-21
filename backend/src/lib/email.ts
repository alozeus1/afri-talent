import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import logger from "./logger.js";
import { recordOpsEvent } from "./ops/events.js";
import { pushDeadLetter, withRetry } from "./ops/resilience.js";

const SES_REGION = process.env.SES_REGION || process.env.AWS_REGION || "us-east-1";
const FROM_EMAIL = process.env.SES_FROM_EMAIL;
const IS_DEV = !FROM_EMAIL;

let _ses: SESClient | null = null;

function getSES(): SESClient {
  if (!_ses) {
    _ses = new SESClient({ region: SES_REGION });
  }
  return _ses;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateName?: string;
}

async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const recipientDomain = opts.to.includes("@") ? opts.to.split("@")[1] : "unknown";

  // No SES_FROM_EMAIL configured: log loudly and record a SKIP — never a
  // success. Previously this reported notification_delivery_success in "dev
  // mode", which hid missing email config in real deployments (verification
  // emails silently dropped while metrics looked healthy).
  if (IS_DEV) {
    logger.warn(
      { to: opts.to, subject: opts.subject },
      "[email] SES_FROM_EMAIL not configured — email NOT sent (set SES_FROM_EMAIL + AWS credentials to enable delivery)",
    );
    // Email bodies routinely include password-reset and verification URLs.
    // Never log rendered content, even when delivery is intentionally
    // disabled in a local environment.
    logger.debug(
      { template: opts.templateName ?? "generic", recipientDomain },
      "[email] delivery skipped; body redacted",
    );
    recordOpsEvent({
      metricName: "notification_delivery_skipped",
      category: "notifications",
      severity: "warning",
      details: {
        channel: "email",
        reason: "ses_not_configured",
        template: opts.templateName ?? "generic",
        recipient_domain: recipientDomain,
      },
    });
    return;
  }

  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [opts.to] },
    Message: {
      Subject: { Data: opts.subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: opts.html, Charset: "UTF-8" },
        Text: { Data: opts.text, Charset: "UTF-8" },
      },
    },
  });

  try {
    await withRetry(
      () => getSES().send(command),
      {
        operationName: `email_${opts.templateName ?? "generic"}`,
        attempts: 3,
        initialDelayMs: 500,
      },
    );
    logger.info({ to: opts.to, subject: opts.subject }, "[email] sent");
    recordOpsEvent({
      metricName: "notification_delivery_success",
      category: "notifications",
      details: {
        channel: "email",
        template: opts.templateName ?? "generic",
        recipient_domain: recipientDomain,
      },
    });
  } catch (error) {
    await pushDeadLetter({
      category: "email",
      source: opts.templateName ?? "generic",
      reasonCode: "email_send_failed",
      error,
      payload: {
        subject: opts.subject,
        recipient_domain: recipientDomain,
      },
    });
    recordOpsEvent({
      metricName: "notification_delivery_failure",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: {
        channel: "email",
        template: opts.templateName ?? "generic",
        recipient_domain: recipientDomain,
      },
    });
    throw error;
  }
}

// ── Apply-pathway sender (PR Q) ──────────────────────────────────────────────
//
// Unlike the notification templates above, the EMAIL_DRAFT track needs the
// SES MessageId back (it becomes the EMAIL_MESSAGE_ID submission proof) and
// sets Reply-To to the candidate so employers respond directly to them.
// Dev mode (no SES_FROM_EMAIL) returns a synthetic id so the apply pathway
// remains testable end-to-end locally.

export async function sendApplyDraftEmail(opts: {
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ messageId: string }> {
  const recipientDomain = opts.to.includes("@") ? opts.to.split("@")[1] : "unknown";

  if (IS_DEV) {
    logger.info(
      { to: opts.to, replyTo: opts.replyTo, subject: opts.subject },
      "[email] dev mode — apply email not sent",
    );
    return { messageId: `dev-${Date.now()}` };
  }

  const command = new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [opts.to] },
    ReplyToAddresses: [opts.replyTo],
    Message: {
      Subject: { Data: opts.subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: opts.html, Charset: "UTF-8" },
        Text: { Data: opts.text, Charset: "UTF-8" },
      },
    },
  });

  try {
    const response = await withRetry(
      () => getSES().send(command),
      {
        operationName: "email_apply_draft",
        attempts: 3,
        initialDelayMs: 500,
      },
    );
    const messageId = response.MessageId ?? `ses-${Date.now()}`;
    logger.info({ to: opts.to, subject: opts.subject, messageId }, "[email] apply email sent");
    recordOpsEvent({
      metricName: "notification_delivery_success",
      category: "notifications",
      details: {
        channel: "email",
        template: "apply_draft",
        recipient_domain: recipientDomain,
      },
    });
    return { messageId };
  } catch (error) {
    await pushDeadLetter({
      category: "email",
      source: "apply_draft",
      reasonCode: "email_send_failed",
      error,
      payload: {
        subject: opts.subject,
        recipient_domain: recipientDomain,
      },
    });
    recordOpsEvent({
      metricName: "notification_delivery_failure",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: {
        channel: "email",
        template: "apply_draft",
        recipient_domain: recipientDomain,
      },
    });
    throw error;
  }
}

// ── Email templates ──────────────────────────────────────────────────────────

export async function newMessageEmail(opts: {
  to: string;
  recipientName: string;
  senderName: string;
  threadUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `New message from ${opts.senderName} on AfriTalent`,
    templateName: "new_message",
    html: `
      <h2>Hi ${opts.recipientName},</h2>
      <p>You have a new message from <strong>${opts.senderName}</strong> on AfriTalent.</p>
      <p><a href="${opts.threadUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Message</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
    text: `Hi ${opts.recipientName},\n\nYou have a new message from ${opts.senderName} on AfriTalent.\n\nView it here: ${opts.threadUrl}`,
  });
}

export async function applicationStatusEmail(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: string;
  jobUrl: string;
}): Promise<void> {
  const statusLabel: Record<string, string> = {
    REVIEWING: "is being reviewed",
    SHORTLISTED: "has been shortlisted",
    ACCEPTED: "has been accepted",
    REJECTED: "was not selected at this time",
  };
  const label = statusLabel[opts.status] || "has been updated";

  await sendEmail({
    to: opts.to,
    subject: `Application update: ${opts.jobTitle} at ${opts.companyName}`,
    templateName: "application_status",
    html: `
      <h2>Hi ${opts.candidateName},</h2>
      <p>Your application for <strong>${opts.jobTitle}</strong> at <strong>${opts.companyName}</strong> ${label}.</p>
      <p><a href="${opts.jobUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Application</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
    text: `Hi ${opts.candidateName},\n\nYour application for ${opts.jobTitle} at ${opts.companyName} ${label}.\n\nView it here: ${opts.jobUrl}`,
  });
}

export async function jobMatchEmail(opts: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  visaSponsored: boolean;
  jobUrl: string;
}): Promise<void> {
  const sponsorBadge = opts.visaSponsored ? " 🌍 Visa Sponsored" : "";

  await sendEmail({
    to: opts.to,
    subject: `New job match: ${opts.jobTitle}${sponsorBadge}`,
    templateName: "job_match",
    html: `
      <h2>Hi ${opts.candidateName},</h2>
      <p>A new job matches your profile on AfriTalent:</p>
      <h3>${opts.jobTitle} — ${opts.companyName}</h3>
      ${opts.visaSponsored ? "<p><strong>✅ Visa Sponsorship Available</strong></p>" : ""}
      <p><a href="${opts.jobUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Job</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
    text: `Hi ${opts.candidateName},\n\nNew job match: ${opts.jobTitle} at ${opts.companyName}.\n${opts.visaSponsored ? "Visa Sponsorship: YES\n" : ""}\nView it: ${opts.jobUrl}`,
  });
}

export async function candidateWeeklyDigestEmail(opts: {
  to: string;
  candidateName: string;
  digestUrl: string;
  jobs: Array<{
    title: string;
    companyName: string;
    location: string;
    summary: string;
    url: string;
  }>;
}): Promise<void> {
  const topJobs = opts.jobs.slice(0, 5);
  if (topJobs.length === 0) {
    return;
  }

  await sendEmail({
    to: opts.to,
    subject: "Your AfriTalent weekly digest is ready",
    templateName: "candidate_weekly_digest",
    html: `
      <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
        <h2>Hi ${opts.candidateName},</h2>
        <p>Here are the strongest fresh opportunities we found for you this week.</p>
        <ul style="padding-left: 18px;">
          ${topJobs
            .map(
              (job) => `
                <li style="margin-bottom: 16px;">
                  <strong>${job.title}</strong> at <strong>${job.companyName}</strong><br/>
                  <span style="color: #4b5563;">${job.location}</span><br/>
                  <span style="color: #6b7280;">${job.summary}</span><br/>
                  <a href="${job.url}" style="color: #059669;">View role</a>
                </li>
              `,
            )
            .join("")}
        </ul>
        <p><a href="${opts.digestUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Manage digest preferences</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: [
      `Hi ${opts.candidateName},`,
      "",
      "Here are the strongest fresh opportunities we found for you this week:",
      "",
      ...topJobs.map(
        (job) =>
          `- ${job.title} at ${job.companyName} (${job.location})\n  ${job.summary}\n  ${job.url}`,
      ),
      "",
      `Manage digest preferences: ${opts.digestUrl}`,
    ].join("\n"),
  });
}

export async function passwordResetEmail(opts: {
  to: string;
  userName: string;
  resetUrl: string;
  expiresInHours: number;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Reset your AfriTalent password",
    templateName: "password_reset",
    html: `
      <h2>Hi ${opts.userName},</h2>
      <p>We received a request to reset your password. Click the button below to choose a new password:</p>
      <p><a href="${opts.resetUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Reset Password</a></p>
      <p style="color:#6b7280;font-size:14px;">This link will expire in ${opts.expiresInHours} hour${opts.expiresInHours > 1 ? "s" : ""}.</p>
      <p style="color:#6b7280;font-size:14px;">If you did not request a password reset, you can safely ignore this email.</p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
    text: `Hi ${opts.userName},\n\nWe received a request to reset your password.\n\nReset your password here: ${opts.resetUrl}\n\nThis link expires in ${opts.expiresInHours} hour(s).\n\nIf you did not request this, you can safely ignore this email.`,
  });
}

export async function verificationEmail(opts: {
  to: string;
  companyName: string;
  status: "VERIFIED" | "PENDING" | "UNVERIFIED";
  portalUrl: string;
}): Promise<void> {
  const statusMessages: Record<string, string> = {
    VERIFIED: "Your company has been verified on AfriTalent. Candidates can now see your Verified Employer badge.",
    PENDING: "Your company verification is under review. We'll notify you when it's complete.",
    UNVERIFIED: "We could not verify your company at this time. Please contact support.",
  };

  await sendEmail({
    to: opts.to,
    subject: `AfriTalent employer verification: ${opts.status}`,
    templateName: "employer_verification_status",
    html: `
      <h2>Hi ${opts.companyName},</h2>
      <p>${statusMessages[opts.status]}</p>
      <p><a href="${opts.portalUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Employer Portal</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
    text: `Hi ${opts.companyName},\n\n${statusMessages[opts.status]}\n\nPortal: ${opts.portalUrl}`,
  });
}

export async function welcomeEmail(opts: {
  to: string;
  userName: string;
  role: "CANDIDATE" | "EMPLOYER" | "ADMIN";
  appUrl: string;
}): Promise<void> {
  const heading =
    opts.role === "EMPLOYER"
      ? "Welcome to AfriTalent — let's find you great talent"
      : "Welcome to AfriTalent — your global career starts here";
  const body =
    opts.role === "EMPLOYER"
      ? "Your employer account is ready. You can post roles, search verified candidates, and manage your hiring pipeline."
      : "Your candidate account is ready. Build your profile, get matched to global roles, and apply with one click.";

  await sendEmail({
    to: opts.to,
    subject: heading,
    templateName: "welcome_account_registered",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.userName},</h2>
        <p>${body}</p>
        <p><a href="${opts.appUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Go to AfriTalent</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.userName},\n\n${body}\n\nGo to AfriTalent: ${opts.appUrl}`,
  });
}

export async function accountClosedEmail(opts: {
  to: string;
  userName: string;
  scheduledDeletionDays: number;
  supportUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Your AfriTalent account closure request",
    templateName: "account_closed",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.userName},</h2>
        <p>We've received your request to close your AfriTalent account.</p>
        <p>Your account and data will be permanently deleted in <strong>${opts.scheduledDeletionDays} days</strong>. You can sign in any time during that window to cancel the request.</p>
        <p>If you didn't request this, contact our team right away:</p>
        <p><a href="${opts.supportUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Contact Support</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.userName},\n\nWe've received your request to close your AfriTalent account.\n\nYour account will be permanently deleted in ${opts.scheduledDeletionDays} days. Sign in any time during that window to cancel.\n\nIf you didn't request this, contact support: ${opts.supportUrl}`,
  });
}

export async function accountEmailVerificationEmail(opts: {
  to: string;
  candidateName: string;
  verifyUrl: string;
  expiresInHours: number;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Verify your AfriTalent email",
    templateName: "account_email_verification",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to AfriTalent, ${opts.candidateName}!</h2>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${opts.verifyUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Verify Email
        </a>
        <p style="margin-top: 16px; color: #666;">This link expires in ${opts.expiresInHours} hours.</p>
        <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
    text: `Welcome to AfriTalent, ${opts.candidateName}!\n\nVerify your email here: ${opts.verifyUrl}\n\nThis link expires in ${opts.expiresInHours} hours.`,
  });
}

export async function passwordChangedEmail(opts: {
  to: string;
  userName: string;
  changedAt: Date;
  supportUrl: string;
}): Promise<void> {
  const when = opts.changedAt.toUTCString();
  await sendEmail({
    to: opts.to,
    subject: "Your AfriTalent password was changed",
    templateName: "password_changed",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.userName},</h2>
        <p>Your AfriTalent account password was changed on <strong>${when}</strong>.</p>
        <p>If this was you, no further action is needed.</p>
        <p>If you didn't make this change, your account may be compromised. Reset your password immediately and contact support:</p>
        <p><a href="${opts.supportUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Contact Support</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Security notification</p>
      </div>
    `,
    text: `Hi ${opts.userName},\n\nYour AfriTalent password was changed on ${when}.\n\nIf this was you, no further action is needed.\n\nIf you didn't make this change, contact support immediately: ${opts.supportUrl}`,
  });
}

export async function emailVerifiedEmail(opts: {
  to: string;
  userName: string;
  appUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Your AfriTalent email is verified",
    templateName: "email_verified",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.userName},</h2>
        <p>Your email address is now verified on AfriTalent.</p>
        <p>You now have full access to applications, messages, and verified-only opportunities.</p>
        <p><a href="${opts.appUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Continue to AfriTalent</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.userName},\n\nYour email address is now verified on AfriTalent.\n\nContinue: ${opts.appUrl}`,
  });
}

export async function newApplicationEmail(opts: {
  to: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  applicationUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `New application: ${opts.jobTitle}`,
    templateName: "new_application",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.employerName},</h2>
        <p><strong>${opts.candidateName}</strong> has applied for <strong>${opts.jobTitle}</strong>.</p>
        <p>Review their profile and move them through your pipeline.</p>
        <p><a href="${opts.applicationUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Review Application</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.employerName},\n\n${opts.candidateName} has applied for ${opts.jobTitle}.\n\nReview: ${opts.applicationUrl}`,
  });
}

export async function jobPublishedEmail(opts: {
  to: string;
  employerName: string;
  jobTitle: string;
  jobUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `Your job is live: ${opts.jobTitle}`,
    templateName: "job_published",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.employerName},</h2>
        <p>Your job <strong>${opts.jobTitle}</strong> is now published and visible to candidates on AfriTalent.</p>
        <p>We'll notify you as applications come in. You can promote, edit, or close the job at any time from your dashboard.</p>
        <p><a href="${opts.jobUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">View Job</a></p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.employerName},\n\nYour job ${opts.jobTitle} is now published.\n\nView: ${opts.jobUrl}`,
  });
}

export async function phoneVerifiedEmail(opts: {
  to: string;
  userName: string;
  phoneMasked: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "Your AfriTalent phone number is verified",
    templateName: "phone_verified",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${opts.userName},</h2>
        <p>Your phone number ending in <strong>${opts.phoneMasked}</strong> is now verified.</p>
        <p>This adds a trust signal to your AfriTalent profile and unlocks SMS-based security alerts.</p>
        <p>If you didn't perform this verification, please reset your password and contact support immediately.</p>
        <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
      </div>
    `,
    text: `Hi ${opts.userName},\n\nYour phone number ending in ${opts.phoneMasked} is now verified.\n\nIf you didn't perform this verification, reset your password and contact support immediately.`,
  });
}
