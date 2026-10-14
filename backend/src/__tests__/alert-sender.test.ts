/**
 * Alert dispatcher: orphaned alerts (deleted/disabled saved search) must not
 * starve valid alerts, and job-match emails honour NotificationPreference.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

type Alert = {
  id: string;
  userId: string;
  searchId: string | null;
  matchScore: number | null;
  sentAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string; email: string };
  job: Record<string, unknown>;
};

const { state, db, notify, email } = vi.hoisted(() => {
  const state = {
    alerts: [] as Alert[],
    searches: [] as { id: string; alertEnabled: boolean; alertFrequency: string; lastAlertAt: Date | null; createdAt: Date }[],
    prefs: [] as Record<string, unknown>[],
    recentEmails: [] as { createdAt: Date }[],
  };
  const matchesIn = (value: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === "object" && "in" in (cond as object)) {
      return ((cond as { in: unknown[] }).in).includes(value);
    }
    return value === cond;
  };
  const db = {
    jobAlert: {
      findMany: vi.fn(async (args: { where: Record<string, unknown>; distinct?: string[]; take?: number }) => {
        let rows = state.alerts.filter((a) => a.sentAt === null);
        const sid = args.where.searchId as { not?: null } | undefined;
        if (sid && "not" in sid) rows = rows.filter((a) => a.searchId !== null);
        if (args.distinct) {
          const seen = new Set<string | null>();
          return rows.filter((a) => (seen.has(a.searchId) ? false : (seen.add(a.searchId), true)))
            .map((a) => ({ searchId: a.searchId }));
        }
        rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows.slice(0, args.take ?? rows.length);
      }),
      deleteMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const before = state.alerts.length;
        state.alerts = state.alerts.filter((a) => {
          const w = args.where;
          const hit =
            a.sentAt === null &&
            (w.searchId === undefined || matchesIn(a.searchId, w.searchId)) &&
            (w.id === undefined || matchesIn(a.id, w.id));
          return !hit;
        });
        return { count: before - state.alerts.length };
      }),
      updateMany: vi.fn(async (args: { where: { id: { in: string[] } }; data: { sentAt: Date } }) => {
        for (const a of state.alerts) if (args.where.id.in.includes(a.id)) a.sentAt = args.data.sentAt;
        return { count: args.where.id.in.length };
      }),
    },
    savedSearch: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] }; alertEnabled?: boolean } }) =>
        state.searches.filter(
          (s) =>
            args.where.id.in.includes(s.id) &&
            (args.where.alertEnabled === undefined || s.alertEnabled === args.where.alertEnabled),
        ),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    notificationPreference: { findMany: vi.fn(async () => state.prefs) },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(async (_args: { where: Record<string, unknown> }) => state.recentEmails),
    },
  };
  return { state, db, notify: vi.fn().mockResolvedValue({}), email: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../lib/prisma.js", () => ({ default: db }));
vi.mock("../lib/notifications.js", () => ({ createUserNotification: notify }));
vi.mock("../lib/email.js", () => ({ jobMatchEmail: email }));
vi.mock("../lib/ops/resilience.js", () => ({ pushDeadLetter: vi.fn().mockResolvedValue(undefined) }));

import { runAlertDispatchCycle } from "../workers/alert-sender.js";

function makeAlert(i: number, overrides: Partial<Alert> = {}): Alert {
  return {
    id: `alert-${i}`,
    userId: `user-${i}`,
    searchId: null,
    matchScore: 80,
    sentAt: null,
    createdAt: new Date(Date.now() - (1000 - i) * 60_000),
    user: { id: `user-${i}`, name: `User ${i}`, email: `u${i}@test.com` },
    job: { id: `job-${i}`, title: `Job ${i}`, slug: `job-${i}`, location: "Lagos", visaSponsorship: "NO", sourceName: "S", employerId: null, employer: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.alerts = [];
  state.searches = [];
  state.prefs = [];
  state.recentEmails = [];
});

describe("runAlertDispatchCycle — orphaned alerts", () => {
  it("150 orphan alerts at the head of the queue do not block a valid one", async () => {
    // 150 oldest alerts belong to deleted (75) or disabled (75) saved searches.
    state.searches.push({
      id: "disabled-search", alertEnabled: false, alertFrequency: "INSTANT", lastAlertAt: null, createdAt: new Date(0),
    });
    for (let i = 0; i < 150; i++) {
      state.alerts.push(makeAlert(i, { searchId: i < 75 ? `deleted-search-${i % 5}` : "disabled-search" }));
    }
    // The one valid alert is the newest.
    state.alerts.push(makeAlert(500, { userId: "valid-user", user: { id: "valid-user", name: "V", email: "v@test.com" } }));

    await runAlertDispatchCycle();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].userId).toBe("valid-user");
    expect(state.alerts.filter((a) => a.searchId !== null)).toHaveLength(0); // orphans deleted
    expect(state.alerts.find((a) => a.id === "alert-500")?.sentAt).toBeInstanceOf(Date);
  });
});

describe("runAlertDispatchCycle — notification preferences", () => {
  it("skips the email (but still notifies in-app) when savedSearchAlerts is false", async () => {
    state.alerts.push(makeAlert(1));
    state.prefs.push({ userId: "user-1", savedSearchAlerts: false, maxNotificationsPerWeek: 6, minimumHoursBetweenNotifications: 18 });
    await runAlertDispatchCycle();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].metadata.emailSent).toBe(false);
    expect(email).not.toHaveBeenCalled();
  });

  it("skips the email inside minimumHoursBetweenNotifications", async () => {
    state.alerts.push(makeAlert(1));
    state.recentEmails = [{ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }]; // 2h ago, default min 18h
    await runAlertDispatchCycle();
    expect(email).not.toHaveBeenCalled();
  });

  it("skips the email once maxNotificationsPerWeek is reached", async () => {
    state.alerts.push(makeAlert(1));
    state.prefs.push({ userId: "user-1", savedSearchAlerts: true, maxNotificationsPerWeek: 2, minimumHoursBetweenNotifications: 0 });
    state.recentEmails = [
      { createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
      { createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000) },
    ];
    await runAlertDispatchCycle();
    expect(email).not.toHaveBeenCalled();
  });

  it("sends the email when allowed and marks the notification emailSent", async () => {
    state.alerts.push(makeAlert(1));
    await runAlertDispatchCycle();
    expect(email).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].metadata.emailSent).toBe(true);
    expect(db.notification.findMany.mock.calls[0][0].where.metadata).toEqual({ path: ["emailSent"], equals: true });
  });
});
