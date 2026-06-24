// §5.7 / PR Q — Track B (EMAIL_DRAFT) sender.
//
// Composes and sends the candidate's application email to the job's detected
// apply address (careers@…, jobs@…, mailto: targets). The SES MessageId is
// the EMAIL_MESSAGE_ID submission proof.
//
// Two consumers:
//   - lib/apply/dispatch.ts (inline path, APPLY_QUEUES_ENABLED=0): calls
//     composeAndSendApplyEmail() and returns the proof to the /submit route,
//     which settles the Application.
//   - workers/apply-email-worker.ts (queue path): calls
//     settleEmailApplication() which sends AND settles the row itself.
//
// Safety:
//   - recipient must look like an email address (ingestion data is untrusted)
//   - EmployerApplyOptOut is re-checked at send time (classification-time
//     downgrade can race a fresh opt-out) → EmployerOptedOutError so the
//     caller can fall back to the assisted-redirect track
//   - all candidate-controlled content is HTML-escaped in the HTML part

import { SubmissionProofKind, SubmissionStatus } from "@prisma/client";
import prisma from "../prisma.js";
import logger from "../logger.js";
import { sendApplyDraftEmail } from "../email.js";
import { runOnce } from "../ai/langgraph/tools/idempotency.js";

// Opt-in idempotency guard around the SES send. Off by default → identical
// behavior. When APPLY_SES_IDEMPOTENCY=1, a retry/replay for the same
// application reuses the prior MessageId instead of sending a duplicate email.
function sesIdempotencyEnabled(): boolean {
  return process.env.APPLY_SES_IDEMPOTENCY === "1";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class EmployerOptedOutError extends Error {
  constructor(domain: string) {
    super(`Employer domain ${domain} has opted out of email applications`);
    this.name = "EmployerOptedOutError";
  }
}

export interface ApplyEmailResult {
  messageId: string;
  to: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function composeAndSendApplyEmail(applicationId: string): Promise<ApplyEmailResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: { select: { name: true, email: true, phoneNumber: true } },
      job: {
        select: {
          title: true,
          applyEmailDetected: true,
          employer: { select: { companyName: true } },
          sourceName: true,
        },
      },
    },
  });

  if (!application) {
    throw new Error(`Application ${applicationId} not found`);
  }

  const to = application.job.applyEmailDetected?.trim().toLowerCase() ?? "";
  if (!EMAIL_PATTERN.test(to)) {
    throw new Error("Job has no valid apply email address for the EMAIL_DRAFT track");
  }

  // §5.9 — re-check the employer opt-out registry at send time.
  const domain = to.split("@")[1];
  const optOut = await prisma.employerApplyOptOut.findUnique({ where: { domain } });
  if (optOut && optOut.expiresAt > new Date()) {
    throw new EmployerOptedOutError(domain);
  }

  const candidateName = application.candidate.name?.trim() || "An AfriTalent candidate";
  const companyName =
    application.job.employer?.companyName || application.job.sourceName || "your team";
  const jobTitle = application.job.title;
  const coverLetter = application.coverLetter?.trim()
    || `I would like to apply for the ${jobTitle} position. My profile and experience are summarised below.`;

  const contactLines = [
    `Name: ${candidateName}`,
    `Email: ${application.candidate.email}`,
    ...(application.candidate.phoneNumber ? [`Phone: ${application.candidate.phoneNumber}`] : []),
  ];

  const subject = `Application for ${jobTitle} — ${candidateName}`;
  const text = [
    `Dear ${companyName} hiring team,`,
    "",
    coverLetter,
    "",
    "Candidate contact:",
    ...contactLines,
    "",
    "Submitted via AfriTalent (https://afri-talent.com) on the candidate's behalf.",
    "Reply directly to this email to reach the candidate.",
  ].join("\n");

  const html = `
    <p>Dear ${escapeHtml(companyName)} hiring team,</p>
    <p>${escapeHtml(coverLetter).replaceAll("\n", "<br/>")}</p>
    <p><strong>Candidate contact</strong><br/>${contactLines.map(escapeHtml).join("<br/>")}</p>
    <p style="color:#667;font-size:12px">Submitted via AfriTalent on the candidate's behalf.
    Reply directly to this email to reach the candidate.</p>
  `;

  const send = () =>
    sendApplyDraftEmail({
      to,
      replyTo: application.candidate.email,
      subject,
      html,
      text,
    }).then((r) => r.messageId);

  let messageId: string;
  let deduped = false;
  if (sesIdempotencyEnabled()) {
    const once = await runOnce("ses_apply_email", applicationId, send);
    messageId = once.ref;
    deduped = once.deduped;
  } else {
    messageId = await send();
  }

  logger.info(
    { applicationId, recipientDomain: domain, messageId, deduped },
    deduped ? "[apply-email] duplicate send suppressed (idempotent)" : "[apply-email] application email sent",
  );

  return { messageId, to };
}

// Queue-path settle: send the email and move the Application row to its
// terminal state. Mirrors the /submit route's settle block (routes own the
// settle on the inline path; the worker owns it here because the HTTP request
// has long since returned).
export async function settleEmailApplication(applicationId: string): Promise<ApplyEmailResult> {
  const sent = await composeAndSendApplyEmail(applicationId);

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      submissionStatus: SubmissionStatus.SUBMITTED,
      submittedAt: new Date(),
      submissionProofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
      submissionProofRef: sent.messageId,
      submissionProvider: "ses",
      lastSubmissionError: null,
    },
  });

  return sent;
}

export async function failEmailApplication(applicationId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "EMAIL_DRAFT send failed";
  await prisma.application
    .update({
      where: { id: applicationId },
      data: {
        submissionStatus: SubmissionStatus.FAILED,
        lastSubmissionError: message.slice(0, 500),
      },
    })
    .catch((updateError) => {
      logger.error(
        { applicationId, err: (updateError as Error).message },
        "[apply-email] failed to mark application FAILED",
      );
    });
}
