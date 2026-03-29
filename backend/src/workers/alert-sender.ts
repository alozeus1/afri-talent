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

function hoursSince(from: Date | null | undefined, to = new Date()): number {
  if (!from) return Number.POSITIVE_INFINITY;
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

function isSearchDeliveryDue(search: {
  alertFrequency: "INSTANT" | "DAILY" | "WEEKLY";
  lastAlertAt: Date | null;
  createdAt: Date;
}): boolean {
  const referenceTime = search.lastAlertAt ?? search.createdAt;
  if (search.alertFrequency === "WEEKLY") {
    return hoursSince(referenceTime) >= 24 * 7;
  }
  if (search.alertFrequency === "DAILY") {
    return hoursSince(referenceTime) >= 24;
  }
  return true;
}

export async function runAlertDispatchCycle(): Promise<void> {
  let sent = 0;
  let errors = 0;

  // Fetch unsent alerts with user and job data
  const pendingAlerts = await prisma.jobAlert.findMany({
    where: { sentAt: null },
    select: {
      id: true,
      userId: true,
      searchId: true,
      matchScore: true,
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

  const searchIds = Array.from(
    new Set(
      pendingAlerts
        .map((alert) => alert.searchId)
        .filter((searchId): searchId is string => Boolean(searchId)),
    ),
  );

  const searches = searchIds.length
    ? await prisma.savedSearch.findMany({
      where: {
        id: { in: searchIds },
      },
      select: {
        id: true,
        alertEnabled: true,
        alertFrequency: true,
        lastAlertAt: true,
        createdAt: true,
      },
    })
    : [];
  const searchMap = new Map(searches.map((search) => [search.id, search]));

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
      const eligibleAlerts = userAlerts.filter((alert) => {
        if (!alert.searchId) {
          return true;
        }
        const search = searchMap.get(alert.searchId);
        if (!search || !search.alertEnabled) {
          return false;
        }
        return isSearchDeliveryDue(search);
      });

      if (eligibleAlerts.length === 0) {
        continue;
      }

      const user = userAlerts[0].user;

      if (eligibleAlerts.length === 1) {
        // Single alert: send individual notification + email
        const alert = eligibleAlerts[0];
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
        const topJobs = eligibleAlerts
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
          .slice(0, 5);

        const jobTitles = topJobs
          .map((a) => a.job.title)
          .join(", ");

        await createUserNotification({
          userId,
          type: "JOB_MATCH",
          title: `${eligibleAlerts.length} new job matches found`,
          body: `We found ${eligibleAlerts.length} jobs matching your profile: ${jobTitles}${eligibleAlerts.length > 5 ? ` and ${eligibleAlerts.length - 5} more` : ""}.`,
          channel: "savedSearchAlerts",
          metadata: {
            alertCount: eligibleAlerts.length,
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
          jobTitle: `${topAlert.job.title} (+${eligibleAlerts.length - 1} more)`,
          companyName: topCompany,
          visaSponsored: topAlert.job.visaSponsorship === "YES",
          jobUrl: `${FRONTEND_URL}/jobs`,
        }).catch((err) =>
          logger.warn({ userId: userId.slice(0, 8), err }, "[alert-sender] digest email failed")
        );
      }

      // Mark all eligible alerts as sent
      await prisma.jobAlert.updateMany({
        where: { id: { in: eligibleAlerts.map((a) => a.id) } },
        data: { sentAt: new Date() },
      });

      const searchIdsToUpdate = Array.from(
        new Set(
          eligibleAlerts
            .map((alert) => alert.searchId)
            .filter((searchId): searchId is string => Boolean(searchId)),
        ),
      );

      if (searchIdsToUpdate.length > 0) {
        await prisma.savedSearch.updateMany({
          where: { id: { in: searchIdsToUpdate } },
          data: { lastAlertAt: new Date() },
        });
      }

      sent += eligibleAlerts.length;
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
