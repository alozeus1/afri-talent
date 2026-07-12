import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, createUserNotification } = vi.hoisted(() => ({
  mockPrisma: {
    mockInterviewSession: { deleteMany: vi.fn() },
    calendarEvent: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    notificationPreference: { findUnique: vi.fn() },
  },
  createUserNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../lib/notifications.js", () => ({ createUserNotification }));

import { runMockInterviewRetentionCycle } from "../mock-interview-retention.js";
import { runInterviewReminderCycle } from "../interview-reminder.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.calendarEvent.update.mockResolvedValue({});
});

describe("mock-interview retention sweep", () => {
  it("deletes only sessions past their expiresAt", async () => {
    mockPrisma.mockInterviewSession.deleteMany.mockResolvedValueOnce({ count: 3 });
    await runMockInterviewRetentionCycle();
    const where = mockPrisma.mockInterviewSession.deleteMany.mock.calls[0][0].where;
    expect(where.expiresAt.not).toBeNull();
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
  });

  it("no-ops cleanly when nothing is expired", async () => {
    mockPrisma.mockInterviewSession.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(runMockInterviewRetentionCycle()).resolves.toBeUndefined();
  });
});

describe("interview reminders", () => {
  const minutes = (n: number) => n * 60 * 1000;

  it("sends and stamps reminderSentAt for an event inside its lead window", async () => {
    const startTime = new Date(Date.now() + minutes(10)); // 10 min away, 30-min lead → due
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e1", userId: "u1", title: "Onsite", startTime, location: null, meetingUrl: "https://x", reminderMinutes: 30 },
    ]);
    mockPrisma.notificationPreference.findUnique.mockResolvedValueOnce({ interviewReminders: true });

    await runInterviewReminderCycle();

    expect(createUserNotification).toHaveBeenCalledOnce();
    expect(createUserNotification.mock.calls[0][0]).toMatchObject({ userId: "u1", type: "INTERVIEW_PREP" });
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("does not fire before the lead window opens", async () => {
    const startTime = new Date(Date.now() + minutes(2 * 24 * 60)); // 2 days away
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e2", userId: "u1", title: "Later", startTime, location: null, meetingUrl: null, reminderMinutes: 30 },
    ]);
    await runInterviewReminderCycle();
    expect(createUserNotification).not.toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it("honors interviewReminders opt-out (no notification, but stamps to dedupe)", async () => {
    const startTime = new Date(Date.now() + minutes(10));
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e3", userId: "u2", title: "Onsite", startTime, location: null, meetingUrl: null, reminderMinutes: 30 },
    ]);
    mockPrisma.notificationPreference.findUnique.mockResolvedValueOnce({ interviewReminders: false });

    await runInterviewReminderCycle();

    expect(createUserNotification).not.toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "e3" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("only selects INTERVIEW events not yet reminded", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([]);
    await runInterviewReminderCycle();
    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.eventType).toBe("INTERVIEW");
    expect(where.reminderSentAt).toBeNull();
    expect(where.startTime.gt).toBeInstanceOf(Date);
  });
});
