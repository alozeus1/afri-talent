// ─────────────────────────────────────────────────────────────────────────────
// Alert Sender — Dispatches pending JobAlerts as notifications + emails
//
// Picks up JobAlert records with sentAt=null, creates in-app Notification
// records and optionally sends email digests.
//
// Respects alert frequency (INSTANT, DAILY, WEEKLY) from the associated
// SavedSearch if one exists.
//
// Orphaned alerts (saved search deleted or alerts disabled) are deleted so
// they can never fill the oldest-first batch and starve other users.
// Job-match emails honour NotificationPreference: no email when
// savedSearchAlerts=false, and at most maxNotificationsPerWeek emails with at
// least minimumHoursBetweenNotifications between them (in-app notifications
// are still created). Emailed notifications carry metadata.emailSent=true,
// which is what the frequency caps count.
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

// Schema defaults for NotificationPreference, used when a user has no row.
const DEFAULT_MAX_NOTIFICATIONS_PER_WEEK = 6;
const DEFAULT_MIN_HOURS_BETWEEN_NOTIFICATIONS = 18;

type EmailPrefs = {
  savedSearchAlerts: boolean;
  maxNotificationsPerWeek: number;
  minimumHoursBetweenNotifications: number;
};

/**
 * Delete unsent alerts whose saved search no longer exists or has alerts
 * disabled. JobAlert.searchId has no FK, so these would otherwise stay
 * unsent forever and occupy the head of the dispatch queue.
 */
export async function purgeOrphanedAlerts(): Promise<number> {
  const rows = await prisma.jobAlert.findMany({
    where: { sentAt: null, searchId: { not: null } },
    select: { searchId: true },
    distinct: ["searchId"],
  });
  const searchIds = rows
    .map((row) => row.searchId)
    .filter((id): id is string => Boolean(id));
  if (searchIds.length === 0) return 0;

  const live = await prisma.savedSearch.findMany({
    where: { id: { in: searchIds }, alertEnabled: true },
    select: { id: true },
  });
  const liveIds = new Set(live.map((search) => search.id));
  const orphanSearchIds = searchIds.filter((id) => !liveIds.has(id));
  if (orphanSearchIds.length === 0) return 0;

  const { count } = await prisma.jobAlert.deleteMany({
    where: { sentAt: null, searchId: { in: orphanSearchIds } },
  });
  return count;
}

/** Whether a job-match email may be sent now under the user's preferences. */
export async function canSendJobMatchEmail(userId: string, prefs: EmailPrefs | undefined): Promise<boolean> {
  if (prefs && prefs.savedSearchAlerts === false) return false;
  const maxPerWeek = prefs?.maxNotificationsPerWeek ?? DEFAULT_MAX_NOTIFICATIONS_PER_WEEK;
  const minHours = prefs?.minimumHoursBetweenNotifications ?? DEFAULT_MIN_HOURS_BETWEEN_NOTIFICATIONS;
  if (maxPerWeek <= 0) return false;

  const recentEmails = await prisma.notification.findMany({
    where: {
      userId,
      type: "JOB_MATCH",
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      metadata: { path: ["emailSent"], equals: true },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
    take: maxPerWeek,
  });

  if (recentEmails.length >= maxPerWeek) return false;
  if (recentEmails[0] && hoursSince(recentEmails[0].createdAt) < minHours) return false;
  return true;
}

export async function runAlertDispatchCycle(): Promise<void> {
  let sent = 0;
  let errors = 0;

  try {
    const purged = await purgeOrphanedAlerts();
    if (purged > 0) logger.info({ purged }, "[alert-sender] deleted orphaned alerts");
  } catch (err) {
    logger.warn({ err }, "[alert-sender] orphan purge failed (non-fatal)");
  }

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

  // Any orphan that slipped in after the purge (race with a delete/disable)
  // is deleted here rather than left at the head of the queue.
  const orphanAlertIds = pendingAlerts
    .filter((alert) => {
      if (!alert.searchId) return false;
      const search = searchMap.get(alert.searchId);
      return !search || !search.alertEnabled;
    })
    .map((alert) => alert.id);
  if (orphanAlertIds.length > 0) {
    await prisma.jobAlert
      .deleteMany({ where: { id: { in: orphanAlertIds }, sentAt: null } })
      .catch((err) => logger.warn({ err }, "[alert-sender] orphan delete failed (non-fatal)"));
  }

  const prefRows = await prisma.notificationPreference.findMany({
    where: { userId: { in: Array.from(new Set(pendingAlerts.map((alert) => alert.userId))) } },
    select: {
      userId: true,
      savedSearchAlerts: true,
      maxNotificationsPerWeek: true,
      minimumHoursBetweenNotifications: true,
    },
  });
  const prefsByUser = new Map<string, EmailPrefs>(prefRows.map((row) => [row.userId, row]));

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
      // Track last notification time for profile-based alerts (no saved search).
      // Profile-based alerts use a 4-hour minimum spacing to prevent notification spam.
      const PROFILE_ALERT_MIN_HOURS = 4;

      const eligibleAlerts = userAlerts.filter((alert) => {
        if (!alert.searchId) {
          // Profile-based alert — allow through (frequency checked at batch level below)
          return true;
        }
        const search = searchMap.get(alert.searchId);
        if (!search || !search.alertEnabled) {
          return false;
        }
        return isSearchDeliveryDue(search);
      });

      // For profile-based batches (no searchId), enforce minimum spacing
      const hasProfileAlerts = eligibleAlerts.some((a) => !a.searchId);
      if (hasProfileAlerts && eligibleAlerts.every((a) => !a.searchId)) {
        // Check if this user already received a profile-based notification recently
        const recentNotif = await prisma.notification.findFirst({
          where: {
            userId,
            type: "JOB_MATCH",
            createdAt: { gt: new Date(Date.now() - PROFILE_ALERT_MIN_HOURS * 60 * 60 * 1000) },
          },
          select: { id: true },
        });
        if (recentNotif) {
          continue; // Skip — too recent
        }
      }

      if (eligibleAlerts.length === 0) {
        continue;
      }

      const user = userAlerts[0].user;
      const emailAllowed = await canSendJobMatchEmail(userId, prefsByUser.get(userId));

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
            emailSent: emailAllowed,
          },
        });

        if (emailAllowed) await jobMatchEmail({
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
            emailSent: emailAllowed,
          },
        });

        // Send email for top match only
        const topAlert = topJobs[0];
        const topCompany =
          topAlert.job.employer?.companyName ?? topAlert.job.sourceName ?? "Unknown Company";

        if (emailAllowed) await jobMatchEmail({
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
