import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, createUserNotification, s3Send } = vi.hoisted(() => ({
  mockPrisma: {
    mockInterviewSession: { findMany: vi.fn(), delete: vi.fn().mockResolvedValue({}) },
    calendarEvent: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    notificationPreference: { findUnique: vi.fn() },
  },
  createUserNotification: vi.fn().mockResolvedValue({}),
  s3Send: vi.fn().mockResolvedValue({ Errors: [] }),
}));

vi.mock("../../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../lib/notifications.js", () => ({ createUserNotification }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3Send;
  },
  DeleteObjectsCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

import { runMockInterviewRetentionCycle } from "../mock-interview-retention.js";
import { runInterviewReminderCycle } from "../interview-reminder.js";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.calendarEvent.update.mockResolvedValue({});
  mockPrisma.mockInterviewSession.delete.mockResolvedValue({});
  s3Send.mockResolvedValue({ Errors: [] });
});
afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("mock-interview retention sweep", () => {
  it("purges S3 objects BEFORE deleting the session row", async () => {
    process.env.S3_UPLOADS_BUCKET = "uploads";
    mockPrisma.mockInterviewSession.findMany.mockResolvedValueOnce([
      { id: "s1", artifacts: [{ storageKey: "k1" }, { storageKey: "k2" }] },
    ]);

    await runMockInterviewRetentionCycle();

    // S3 delete issued with both keys, and it ran before the row delete.
    expect(s3Send).toHaveBeenCalledOnce();
    const cmd = s3Send.mock.calls[0][0] as { input: { Bucket: string; Delete: { Objects: { Key: string }[] } } };
    expect(cmd.input.Bucket).toBe("uploads");
    expect(cmd.input.Delete.Objects.map((o) => o.Key).sort()).toEqual(["k1", "k2"]);
    expect(mockPrisma.mockInterviewSession.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(s3Send.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.mockInterviewSession.delete.mock.invocationCallOrder[0],
    );
  });

  it("does NOT delete the row when the S3 purge reports errors (keys preserved)", async () => {
    process.env.S3_UPLOADS_BUCKET = "uploads";
    s3Send.mockResolvedValueOnce({ Errors: [{ Key: "k1", Message: "AccessDenied" }] });
    mockPrisma.mockInterviewSession.findMany.mockResolvedValueOnce([
      { id: "s1", artifacts: [{ storageKey: "k1" }] },
    ]);

    await runMockInterviewRetentionCycle();

    expect(mockPrisma.mockInterviewSession.delete).not.toHaveBeenCalled();
  });

  it("selects only sessions past expiresAt, and no-ops when empty", async () => {
    mockPrisma.mockInterviewSession.findMany.mockResolvedValueOnce([]);
    await runMockInterviewRetentionCycle();
    const where = mockPrisma.mockInterviewSession.findMany.mock.calls[0][0].where;
    expect(where.expiresAt.not).toBeNull();
    expect(where.expiresAt.lte).toBeInstanceOf(Date);
    expect(mockPrisma.mockInterviewSession.delete).not.toHaveBeenCalled();
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

  it("catch-up: still sends a short-lead reminder whose start time just passed", async () => {
    // 5-min reminder, interview started 3 min ago — a naive startTime>now filter
    // would have dropped it. It is within the catch-up grace and past its fireAt.
    const startTime = new Date(Date.now() - minutes(3));
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e4", userId: "u1", title: "Quick call", startTime, location: null, meetingUrl: null, reminderMinutes: 5 },
    ]);
    mockPrisma.notificationPreference.findUnique.mockResolvedValueOnce({ interviewReminders: true });

    await runInterviewReminderCycle();

    expect(createUserNotification).toHaveBeenCalledOnce();
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "e4" },
      data: { reminderSentAt: expect.any(Date) },
    });
    // and the query uses a past-grace lower bound, not strictly > now
    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.startTime.gt.getTime()).toBeLessThan(Date.now());
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
