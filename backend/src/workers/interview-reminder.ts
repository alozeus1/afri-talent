// ─────────────────────────────────────────────────────────────────────────────
// Interview reminder sender
//
// Makes the "interviewReminders" notification preference real — it was a toggle
// wired to nothing. Users schedule interviews as CalendarEvents (eventType
// INTERVIEW) with a per-event reminderMinutes lead time. This worker fires an
// in-app reminder once each event enters its lead window, deduped by stamping
// reminderSentAt so a reminder is sent exactly once.
//
// Respects the per-user interviewReminders preference (default on). Best-effort
// per event so one failure never blocks the batch.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { createUserNotification } from "../lib/notifications.js";

export const INTERVIEW_REMINDER_INTERVAL_MS =
  parseInt(process.env.INTERVIEW_REMINDER_INTERVAL_MINUTES || "15", 10) * 60 * 1000;

// Only look a bounded distance ahead so the scan stays small; the per-event
// reminderMinutes gate below decides when a given event actually fires.
const LOOKAHEAD_DAYS = 8;
const DEFAULT_REMINDER_MINUTES = 30;
// Catch-up window: include events whose startTime has *just* passed so a short
// reminderMinutes (< the poll interval) can't fall between polls and be dropped.
// e.g. a 5-min reminder for a 10:10 interview isn't due at the 10:00 poll, and
// startTime <= now at 10:15 — without this grace the 10:15 poll would exclude
// it entirely. It still sends (a few minutes late) rather than silently missing.
const CATCHUP_GRACE_MS = INTERVIEW_REMINDER_INTERVAL_MS + 5 * 60 * 1000;

export async function runInterviewReminderCycle(): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const due = await prisma.calendarEvent.findMany({
    where: {
      eventType: "INTERVIEW",
      reminderSentAt: null,
      startTime: { gt: new Date(now.getTime() - CATCHUP_GRACE_MS), lte: horizon },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      startTime: true,
      location: true,
      meetingUrl: true,
      reminderMinutes: true,
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });

  let sent = 0;
  let skipped = 0;
  for (const ev of due) {
    // Not yet inside the lead window — leave it for a later cycle.
    const leadMs = (ev.reminderMinutes ?? DEFAULT_REMINDER_MINUTES) * 60 * 1000;
    if (now.getTime() < ev.startTime.getTime() - leadMs) continue;

    try {
      const pref = await prisma.notificationPreference.findUnique({
        where: { userId: ev.userId },
        select: { interviewReminders: true },
      });

      if (pref?.interviewReminders === false) {
        // Honor the opt-out, but stamp so we don't re-evaluate every cycle.
        await prisma.calendarEvent.update({ where: { id: ev.id }, data: { reminderSentAt: now } });
        skipped += 1;
        continue;
      }

      await createUserNotification({
        userId: ev.userId,
        type: "INTERVIEW_PREP",
        channel: "interviewReminders",
        title: "Upcoming interview reminder",
        body: `Your interview "${ev.title}" starts at ${ev.startTime.toISOString()}.`,
        metadata: {
          kind: "interview_reminder",
          calendarEventId: ev.id,
          startTime: ev.startTime.toISOString(),
          ...(ev.meetingUrl ? { meetingUrl: ev.meetingUrl } : {}),
          ...(ev.location ? { location: ev.location } : {}),
        },
      });
      await prisma.calendarEvent.update({ where: { id: ev.id }, data: { reminderSentAt: now } });
      sent += 1;
    } catch (err) {
      logger.error(
        { err: String(err), eventId: ev.id },
        "[interview-reminder] failed to send for event (continuing)",
      );
    }
  }

  if (sent === 0 && skipped === 0) return;
  recordOpsEvent({
    metricName: "interview_reminder_cycle",
    category: "notifications",
    details: { candidates: due.length, sent, skipped },
  });
  logger.info({ candidates: due.length, sent, skipped }, "[interview-reminder] cycle complete");
}
