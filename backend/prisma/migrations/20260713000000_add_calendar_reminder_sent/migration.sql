-- Additive: track when an interview reminder was sent, so the interview-reminder
-- worker can dedupe (send each event's reminder exactly once).
ALTER TABLE "CalendarEvent" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

CREATE INDEX "CalendarEvent_eventType_reminderSentAt_startTime_idx" ON "CalendarEvent"("eventType", "reminderSentAt", "startTime");
