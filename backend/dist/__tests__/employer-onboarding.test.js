import { describe, expect, it } from "vitest";
import { EmployerVerificationLevel, SubscriptionPlan } from "@prisma/client";
import { buildEmployerOnboardingChecklist, completionPercentage, employerUpgradeJourney, nextEmployerAction, normalizeEmployerCandidateFilters, verificationImpactSummary, } from "../lib/employer/onboarding.js";
describe("employer onboarding helpers", () => {
    it("normalizes candidate filters safely", () => {
        const filters = normalizeEmployerCandidateFilters({
            skills: ["React", 1, "Node.js"],
            location: "  Lagos  ",
            minExperience: 4,
            verifiedOnly: true,
            visaPreference: "SPONSORED_ONLY",
        });
        expect(filters).toEqual({
            skills: ["React", "Node.js"],
            location: "Lagos",
            minExperience: 4,
            verifiedOnly: true,
            visaPreference: "SPONSORED_ONLY",
        });
    });
    it("calculates checklist completion and the next action", () => {
        const checklist = buildEmployerOnboardingChecklist({
            companySetupDone: true,
            verificationDone: true,
            teamSetupDone: false,
            firstJobPostDone: false,
            candidateFiltersDone: false,
            subscriptionChoiceDone: false,
            trustCompletionDone: false,
        });
        expect(completionPercentage(checklist)).toBe(29);
        expect(nextEmployerAction(checklist)).toMatchObject({
            key: "team_setup",
            title: "Add a hiring teammate",
            href: "/employer/onboarding",
        });
    });
    it("frames verification impact and upgrade journey for early employers", () => {
        expect(verificationImpactSummary({
            verificationLevel: EmployerVerificationLevel.UNVERIFIED,
            qualifiedApplicants: 2,
            totalApplications: 10,
        })).toMatchObject({
            verified: false,
            qualifiedApplicantRate: 20,
        });
        expect(employerUpgradeJourney({
            plan: SubscriptionPlan.EMPLOYER_FREE,
            publishedJobs: 1,
            qualifiedApplicants: 0,
            candidateFiltersDone: true,
        })).toMatchObject({
            targetPlan: SubscriptionPlan.EMPLOYER_BASIC,
            ctaLabel: "View upgrade path",
        });
    });
});
//# sourceMappingURL=employer-onboarding.test.js.map