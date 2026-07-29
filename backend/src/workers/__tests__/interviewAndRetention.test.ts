import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, createUserNotification, s3Send } = vi.hoisted(() => ({
  mockPrisma: {
    mockInterviewSession: { findMany: vi.fn(), delete: vi.fn().mockResolvedValue({}) },
    calendarEvent: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    notificationPreference: { findUnique: vi.fn() },
  },
  createUserNotification: vi.fn().mockResolvedValue({}),
  s3Send: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../lib/notifications.js", () => ({ createUserNotification }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3Send;
  },
  ListObjectVersionsCommand: class {
    input: { Prefix: string };
    readonly _t = "list";
    constructor(input: { Prefix: string }) {
      this.input = input;
    }
  },
  DeleteObjectsCommand: class {
    input: { Delete: { Objects: { Key: string; VersionId?: string }[] } };
    readonly _t = "del";
    constructor(input: { Delete: { Objects: { Key: string; VersionId?: string }[] } }) {
      this.input = input;
    }
  },
}));

import { runMockInterviewRetentionCycle } from "../mock-interview-retention.js";
import { runInterviewReminderCycle } from "../interview-reminder.js";

const OLD_ENV = { ...process.env };

// Default S3: each key has one current version; deletes succeed.
function defaultS3() {
  s3Send.mockImplementation((cmd: { _t: string; input: { Prefix?: string } }) => {
    if (cmd._t === "list") {
      return Promise.resolve({ Versions: [{ Key: cmd.input.Prefix, VersionId: "v1" }], DeleteMarkers: [], IsTruncated: false });
    }
    return Promise.resolve({ Errors: [] });
  });
}

// Find the DeleteObjects call among s3Send calls.
function delCall() {
  return s3Send.mock.calls.find((c) => (c[0] as { _t: string })._t === "del")?.[0] as
    | { input: { Delete: { Objects: { Key: string; VersionId?: string }[] } } }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.calendarEvent.update.mockResolvedValue({});
  mockPrisma.mockInterviewSession.delete.mockResolvedValue({});
  defaultS3();
});
afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("mock-interview retention sweep", () => {
  it("deletes ALL S3 versions, then the row (bytes gone before keys)", async () => {
    process.env.S3_UPLOADS_BUCKET = "uploads";
    s3Send.mockImplementation((cmd: { _t: string; input: { Prefix?: string } }) => {
      if (cmd._t === "list") {
        // two versions for this key — an unversioned delete would leave the older one
        return Promise.resolve({
          Versions: [
            { Key: cmd.input.Prefix, VersionId: "v2" },
            { Key: cmd.input.Prefix, VersionId: "v1" },
          ],
          DeleteMarkers: [],
          IsTruncated: false,
        });
      }
      return Promise.resolve({ Errors: [] });
    });
    mockPrisma.mockInterviewSession.findMany
      .mockResolvedValueOnce([{ id: "s1", artifacts: [{ storageKey: "k1" }] }])
      .mockResolvedValueOnce([]);

    await runMockInterviewRetentionCycle();

    const del = delCall();
    expect(del).toBeDefined();
    expect(del!.input.Delete.Objects).toEqual([
      { Key: "k1", VersionId: "v2" },
      { Key: "k1", VersionId: "v1" },
    ]);
    expect(mockPrisma.mockInterviewSession.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    // S3 version-delete happened before the DB row delete.
    const delOrder = s3Send.mock.invocationCallOrder[s3Send.mock.calls.findIndex((c) => (c[0] as { _t: string })._t === "del")];
    expect(delOrder).toBeLessThan(mockPrisma.mockInterviewSession.delete.mock.invocationCallOrder[0]);
  });

  it("does NOT delete the row when the S3 purge reports errors (keys preserved)", async () => {
    process.env.S3_UPLOADS_BUCKET = "uploads";
    s3Send.mockImplementation((cmd: { _t: string; input: { Prefix?: string } }) => {
      if (cmd._t === "list") {
        return Promise.resolve({ Versions: [{ Key: cmd.input.Prefix, VersionId: "v1" }], DeleteMarkers: [], IsTruncated: false });
      }
      return Promise.resolve({ Errors: [{ Key: "k1", Message: "AccessDenied" }] });
    });
    mockPrisma.mockInterviewSession.findMany.mockResolvedValueOnce([{ id: "s1", artifacts: [{ storageKey: "k1" }] }]);

    await runMockInterviewRetentionCycle();
    expect(mockPrisma.mockInterviewSession.delete).not.toHaveBeenCalled();
  });

  it("drains every expired batch, not just the first", async () => {
    mockPrisma.mockInterviewSession.findMany
      .mockResolvedValueOnce([{ id: "a", artifacts: [] }])
      .mockResolvedValueOnce([{ id: "b", artifacts: [] }])
      .mockResolvedValueOnce([]);

    await runMockInterviewRetentionCycle();

    expect(mockPrisma.mockInterviewSession.findMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.mockInterviewSession.delete).toHaveBeenCalledTimes(2);
  });

  it("stops (no infinite loop) when a batch makes no progress", async () => {
    process.env.S3_UPLOADS_BUCKET = "uploads";
    s3Send.mockImplementation((cmd: { _t: string; input: { Prefix?: string } }) => {
      if (cmd._t === "list") return Promise.resolve({ Versions: [{ Key: cmd.input.Prefix, VersionId: "v1" }], DeleteMarkers: [], IsTruncated: false });
      return Promise.resolve({ Errors: [{ Key: "k", Message: "fail" }] });
    });
    // findMany would keep returning the same undeletable row; the worker must break.
    mockPrisma.mockInterviewSession.findMany.mockResolvedValue([{ id: "stuck", artifacts: [{ storageKey: "k" }] }]);

    await runMockInterviewRetentionCycle();

    expect(mockPrisma.mockInterviewSession.delete).not.toHaveBeenCalled();
    expect(mockPrisma.mockInterviewSession.findMany).toHaveBeenCalledTimes(1);
  });

  it("no-ops cleanly when nothing is expired", async () => {
    mockPrisma.mockInterviewSession.findMany.mockResolvedValueOnce([]);
    await expect(runMockInterviewRetentionCycle()).resolves.toBeUndefined();
    expect(mockPrisma.mockInterviewSession.delete).not.toHaveBeenCalled();
  });
});

describe("interview reminders", () => {
  const minutes = (n: number) => n * 60 * 1000;

  it("sends and stamps reminderSentAt for an event inside its lead window", async () => {
    const startTime = new Date(Date.now() + minutes(10));
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e1", userId: "u1", title: "Onsite", startTime, location: null, meetingUrl: "https://x", reminderMinutes: 30 },
    ]);
    mockPrisma.notificationPreference.findUnique.mockResolvedValueOnce({ interviewReminders: true });

    await runInterviewReminderCycle();

    expect(createUserNotification).toHaveBeenCalledOnce();
    expect(createUserNotification.mock.calls[0][0]).toMatchObject({ userId: "u1", type: "INTERVIEW_PREP" });
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { reminderSentAt: expect.any(Date) } });
  });

  it("catch-up: still sends a short-lead reminder whose start time just passed", async () => {
    const startTime = new Date(Date.now() - minutes(3));
    mockPrisma.calendarEvent.findMany.mockResolvedValueOnce([
      { id: "e4", userId: "u1", title: "Quick call", startTime, location: null, meetingUrl: null, reminderMinutes: 5 },
    ]);
    mockPrisma.notificationPreference.findUnique.mockResolvedValueOnce({ interviewReminders: true });

    await runInterviewReminderCycle();

    expect(createUserNotification).toHaveBeenCalledOnce();
    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.startTime.gt.getTime()).toBeLessThan(Date.now());
  });

  it("does not fire before the lead window opens", async () => {
    const startTime = new Date(Date.now() + minutes(2 * 24 * 60));
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
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({ where: { id: "e3" }, data: { reminderSentAt: expect.any(Date) } });
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
