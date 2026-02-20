import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import logger from "./logger.js";
const SES_REGION = process.env.SES_REGION || process.env.AWS_REGION || "us-east-1";
const FROM_EMAIL = process.env.SES_FROM_EMAIL;
const IS_DEV = !FROM_EMAIL;
let _ses = null;
function getSES() {
    if (!_ses) {
        _ses = new SESClient({ region: SES_REGION });
    }
    return _ses;
}
async function sendEmail(opts) {
    // Dev mode: log instead of send if SES_FROM_EMAIL is not configured
    if (IS_DEV) {
        logger.info({ to: opts.to, subject: opts.subject }, "[email] dev mode — email not sent");
        logger.debug({ text: opts.text }, "[email] body");
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
    await getSES().send(command);
    logger.info({ to: opts.to, subject: opts.subject }, "[email] sent");
}
// ── Email templates ──────────────────────────────────────────────────────────
export async function newMessageEmail(opts) {
    await sendEmail({
        to: opts.to,
        subject: `New message from ${opts.senderName} on AfriTalent`,
        html: `
      <h2>Hi ${opts.recipientName},</h2>
      <p>You have a new message from <strong>${opts.senderName}</strong> on AfriTalent.</p>
      <p><a href="${opts.threadUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Message</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
        text: `Hi ${opts.recipientName},\n\nYou have a new message from ${opts.senderName} on AfriTalent.\n\nView it here: ${opts.threadUrl}`,
    });
}
export async function applicationStatusEmail(opts) {
    const statusLabel = {
        REVIEWING: "is being reviewed",
        SHORTLISTED: "has been shortlisted",
        ACCEPTED: "has been accepted",
        REJECTED: "was not selected at this time",
    };
    const label = statusLabel[opts.status] || "has been updated";
    await sendEmail({
        to: opts.to,
        subject: `Application update: ${opts.jobTitle} at ${opts.companyName}`,
        html: `
      <h2>Hi ${opts.candidateName},</h2>
      <p>Your application for <strong>${opts.jobTitle}</strong> at <strong>${opts.companyName}</strong> ${label}.</p>
      <p><a href="${opts.jobUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Application</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
        text: `Hi ${opts.candidateName},\n\nYour application for ${opts.jobTitle} at ${opts.companyName} ${label}.\n\nView it here: ${opts.jobUrl}`,
    });
}
export async function jobMatchEmail(opts) {
    const sponsorBadge = opts.visaSponsored ? " 🌍 Visa Sponsored" : "";
    await sendEmail({
        to: opts.to,
        subject: `New job match: ${opts.jobTitle}${sponsorBadge}`,
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
export async function verificationEmail(opts) {
    const statusMessages = {
        VERIFIED: "Your company has been verified on AfriTalent. Candidates can now see your Verified Employer badge.",
        PENDING: "Your company verification is under review. We'll notify you when it's complete.",
        UNVERIFIED: "We could not verify your company at this time. Please contact support.",
    };
    await sendEmail({
        to: opts.to,
        subject: `AfriTalent employer verification: ${opts.status}`,
        html: `
      <h2>Hi ${opts.companyName},</h2>
      <p>${statusMessages[opts.status]}</p>
      <p><a href="${opts.portalUrl}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">View Employer Portal</a></p>
      <p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>
    `,
        text: `Hi ${opts.companyName},\n\n${statusMessages[opts.status]}\n\nPortal: ${opts.portalUrl}`,
    });
}
//# sourceMappingURL=email.js.map