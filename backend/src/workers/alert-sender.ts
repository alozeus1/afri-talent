// ─────────────────────────────────────────────────────────────────────────────
// Alert Sender — Dispatches pending JobAlerts as notifications + emails
//
// Picks up JobAlert records with sentAt=null, creates in-app Notification
// records and optionally sends email digests.
//
// Respects alert frequency (INSTANT, DAILY, WEEKLY) from the associated
// SavedSearch if one exists.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { jobMatchEmail } from "../lib/email.js";
import { createUserNotification } from "../lib/notifications.js";
import { pushDeadLetter } from "../lib/ops/resilience.js";

const BATCH_SIZE = parseInt(process.env.ALERT_BATCH_SIZE || "100", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export async function runAlertDispatchCycle(): Promise<void> {
  let sent = 0;
  let errors = 0;

  // Fetch unsent alerts with user and job data
  const pendingAlerts = await prisma.jobAlert.findMany({
    where: { sentAt: null },
    include: {
      user: { select: { id: true, name: true, email: true } },
      job: {
        select: {
          id: true,
          title: true,
          slug: true,
          location: true,
          visaSponsorship: true,
          sourceName: true,
          employerId: true,
          employer: { select: { companyName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pendingAlerts.length === 0) {
    logger.debug("[alert-sender] no pending alerts");
    return;
  }

  // Group alerts by user for batched notifications
  const alertsByUser = new Map<
    string,
    typeof pendingAlerts
  >();

  for (const alert of pendingAlerts) {
    const list = alertsByUser.get(alert.userId) ?? [];
    list.push(alert);
    alertsByUser.set(alert.userId, list);
  }

  for (const [userId, userAlerts] of alertsByUser) {
    try {
      const user = userAlerts[0].user;

      if (userAlerts.length === 1) {
        // Single alert: send individual notification + email
        const alert = userAlerts[0];
        const companyName =
          alert.job.employer?.companyName ?? alert.job.sourceName ?? "Unknown Company";

        await createUserNotification({
          userId,
          type: "JOB_MATCH",
          title: `New job match: ${alert.job.title}`,
          body: `${alert.job.title} at ${companyName} (${alert.job.location}) matches your profile${alert.matchScore ? ` — ${alert.matchScore}% match` : ""}.`,
          channel: "savedSearchAlerts",
          metadata: {
            jobId: alert.job.id,
            jobSlug: alert.job.slug,
            matchScore: alert.matchScore,
          },
        });

        await jobMatchEmail({
          to: user.email,
          candidateName: user.name,
          jobTitle: alert.job.title,
          companyName,
          visaSponsored: alert.job.visaSponsorship === "YES",
          jobUrl: `${FRONTEND_URL}/jobs/${alert.job.slug}`,
        }).catch((err) =>
          logger.warn({ userId: userId.slice(0, 8), err }, "[alert-sender] email failed")
        );
      } else {
        // Multiple alerts: send digest notification
        const topJobs = userAlerts
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
          .slice(0, 5);

        const jobTitles = topJobs
          .map((a) => a.job.title)
          .join(", ");

        await createUserNotification({
          userId,
          type: "JOB_MATCH",
          title: `${userAlerts.length} new job matches found`,
          body: `We found ${userAlerts.length} jobs matching your profile: ${jobTitles}${userAlerts.length > 5 ? ` and ${userAlerts.length - 5} more` : ""}.`,
          channel: "savedSearchAlerts",
          metadata: {
            alertCount: userAlerts.length,
            topJobIds: topJobs.map((a) => a.job.id),
          },
        });

        // Send email for top match only
        const topAlert = topJobs[0];
        const topCompany =
          topAlert.job.employer?.companyName ?? topAlert.job.sourceName ?? "Unknown Company";

        await jobMatchEmail({
          to: user.email,
          candidateName: user.name,
          jobTitle: `${topAlert.job.title} (+${userAlerts.length - 1} more)`,
          companyName: topCompany,
          visaSponsored: topAlert.job.visaSponsorship === "YES",
          jobUrl: `${FRONTEND_URL}/jobs`,
        }).catch((err) =>
          logger.warn({ userId: userId.slice(0, 8), err }, "[alert-sender] digest email failed")
        );
      }

      // Mark all alerts as sent
      await prisma.jobAlert.updateMany({
        where: { id: { in: userAlerts.map((a) => a.id) } },
        data: { sentAt: new Date() },
      });

      sent += userAlerts.length;
    } catch (err) {
      errors += userAlerts.length;
      await pushDeadLetter({
        category: "scheduler",
        source: "alert-dispatch",
        reasonCode: "user_alert_batch_failed",
        error: err,
        payload: {
          userId,
          alertCount: userAlerts.length,
        },
      });
      logger.error(
        { userId: userId.slice(0, 8), alertCount: userAlerts.length, err },
        "[alert-sender] failed processing user alerts"
      );
    }
  }

  logger.info(
    { sent, errors, userCount: alertsByUser.size },
    "[alert-sender] dispatch cycle complete"
  );
}
