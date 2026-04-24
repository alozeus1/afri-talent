import { describe, expect, it } from "vitest";
import { assessApplicationRisk, assessCandidateTrust, assessContentRisk, assessEmployerTrust, assessJobPostingRisk, employerBadgeLabel, } from "../lib/trust/risk.js";
describe("trust risk scoring", () => {
    it("marks throwaway employer domains as risky and not eligible to publish", () => {
        const result = assessEmployerTrust({
            email: "recruiter@gmail.com",
            website: "https://afritalent.com",
            linkedInCompanyUrl: null,
            approvedBusinessDocs: 0,
            approvedManualReviews: 0,
            openReports: 0,
            postingVelocity24h: 0,
            isPremiumSubscription: false,
        });
        expect(result.postingEligibility).toBe(false);
        expect(result.throwawayDomainDetected).toBe(true);
        expect(result.riskScore).toBeGreaterThanOrEqual(40);
        expect(result.warnings).toContain("Use a company email address instead of a free inbox provider.");
    });
    it("upgrades strong employer verification to premium trusted when manual review and premium are present", () => {
        const result = assessEmployerTrust({
            email: "hiring@company.com",
            website: "https://company.com",
            linkedInCompanyUrl: "https://linkedin.com/company/company",
            approvedBusinessDocs: 1,
            approvedManualReviews: 1,
            openReports: 0,
            postingVelocity24h: 1,
            isPremiumSubscription: true,
        });
        expect(result.postingEligibility).toBe(true);
        expect(result.verificationLevel).toBe("PREMIUM_TRUSTED");
        expect(employerBadgeLabel(result.verificationLevel)).toBe("Premium trusted employer");
        expect(result.verifiedDomain).toBe("company.com");
    });
    it("marks a well-verified candidate as premium-filter eligible", () => {
        const result = assessCandidateTrust({
            emailVerified: true,
            phoneVerified: true,
            identityVerified: true,
            skillsVerified: true,
            verifiedSkillCount: 3,
            assessmentBackedSkillCount: 1,
            partnerSignalCount: 1,
            employmentVerified: true,
            hasLinkedIn: true,
            hasGitHub: true,
            hasPortfolio: true,
            hasResume: true,
            profileCompleteness: 92,
            workHistoryEntries: 3,
            workHistoryConsistent: true,
            educationEvidenceCount: 1,
            certificationEvidenceCount: 2,
            openReports: 0,
            applicationsLast24h: 2,
        });
        expect(result.premiumFilterEligible).toBe(true);
        expect(result.authenticityScore).toBeGreaterThanOrEqual(60);
        expect(result.riskLevel).toBe("LOW");
    });
    it("holds back premium trust when resume-backed evidence is thin or inconsistent", () => {
        const result = assessCandidateTrust({
            emailVerified: true,
            phoneVerified: true,
            identityVerified: false,
            skillsVerified: false,
            verifiedSkillCount: 0,
            assessmentBackedSkillCount: 0,
            partnerSignalCount: 0,
            employmentVerified: false,
            hasLinkedIn: false,
            hasGitHub: false,
            hasPortfolio: false,
            hasResume: false,
            profileCompleteness: 48,
            workHistoryEntries: 2,
            workHistoryConsistent: false,
            educationEvidenceCount: 0,
            certificationEvidenceCount: 0,
            openReports: 1,
            applicationsLast24h: 12,
        });
        expect(result.premiumFilterEligible).toBe(false);
        expect(result.riskScore).toBeGreaterThanOrEqual(25);
        expect(result.warnings).toContain("Add an active resume so employers can trust your profile details.");
        expect(result.warnings).toContain("Make sure your work history dates and titles are internally consistent.");
    });
    it("auto-holds content that contains fee requests and off-platform contact patterns", () => {
        const result = assessContentRisk("Pay a training fee and contact me on WhatsApp to proceed with your application.");
        expect(result.autoHold).toBe(true);
        expect(result.flags.some((flag) => flag.startsWith("advance_fee"))).toBe(true);
        expect(result.flags.some((flag) => flag.startsWith("off_platform_contact"))).toBe(true);
        expect(result.level).toBe("HIGH");
    });
    it("raises job risk when salary bait and risky content are combined", () => {
        const result = assessJobPostingRisk({
            title: "Quick money engineer",
            description: "No experience needed. Start immediately.",
            salaryMin: 100000,
            salaryMax: 500000,
            employerRiskScore: 30,
        });
        expect(result.flags).toContain("misleading_salary_range");
        expect(result.score).toBeGreaterThanOrEqual(55);
        expect(result.autoHold).toBe(true);
    });
    it("throttles extreme candidate application velocity", () => {
        const result = assessApplicationRisk({
            coverLetter: "Here is my portfolio.",
            applicationsLast24h: 24,
            candidateRiskScore: 20,
        });
        expect(result.flags).toContain("application_velocity_extreme");
        expect(result.level).toBe("MEDIUM");
    });
});
//# sourceMappingURL=trust-risk.test.js.map