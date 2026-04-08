import { describe, expect, it } from "vitest";
import { buildCandidateRetentionExperiments, buildCandidateRetentionJourneys, evaluateLifecycleDelivery, } from "../lib/candidate-retention.js";
describe("candidate retention lifecycle", () => {
    it("keeps experiment assignment stable for a user", () => {
        const first = buildCandidateRetentionExperiments("candidate-123");
        const second = buildCandidateRetentionExperiments("candidate-123");
        expect(first).toEqual(second);
        expect(first).toHaveLength(2);
    });
    it("prioritizes unfinished journeys before completed ones", () => {
        const journeys = buildCandidateRetentionJourneys({
            profileCompleteness: 62,
            verificationLevel: "EMAIL_VERIFIED",
            savedSearchCount: 0,
            openApplications: 1,
            hasSalaryInsight: true,
            hasInterviewPrepOpportunity: true,
        });
        expect(journeys[0].key).toBe("saved_search");
        expect(journeys.find((journey) => journey.key === "profile_completion")?.status).toBe("READY");
        expect(journeys.find((journey) => journey.key === "interview_prep")?.status).toBe("READY");
    });
    it("blocks lifecycle delivery when the weekly budget is exhausted", () => {
        const decision = evaluateLifecycleDelivery({
            state: {
                weekWindowStartedAt: new Date("2026-03-23T00:00:00.000Z"),
                notificationsThisWeek: 6,
                lastNotificationAt: new Date("2026-03-27T12:00:00.000Z"),
            },
            preferences: {
                maxNotificationsPerWeek: 6,
                minimumHoursBetweenNotifications: 12,
            },
            now: new Date("2026-03-28T12:00:00.000Z"),
        });
        expect(decision).toEqual({
            allowed: false,
            reasonCode: "week_budget_exhausted",
        });
    });
    it("blocks lifecycle delivery when notifications are too close together", () => {
        const decision = evaluateLifecycleDelivery({
            state: {
                weekWindowStartedAt: new Date("2026-03-23T00:00:00.000Z"),
                notificationsThisWeek: 2,
                lastNotificationAt: new Date("2026-03-28T06:00:00.000Z"),
            },
            preferences: {
                maxNotificationsPerWeek: 6,
                minimumHoursBetweenNotifications: 12,
            },
            now: new Date("2026-03-28T12:00:00.000Z"),
        });
        expect(decision).toEqual({
            allowed: false,
            reasonCode: "minimum_spacing",
        });
    });
});
//# sourceMappingURL=candidate-retention.test.js.map