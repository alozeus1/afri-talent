import { describe, expect, it } from "vitest";
import { buildTalentMatch } from "./match.js";
describe("buildTalentMatch", () => {
    it("prioritizes trust and mobility signals alongside semantic fit", () => {
        const result = buildTalentMatch({
            query: "Senior React engineer for UK relocation-ready hiring",
            desiredSkills: ["React", "TypeScript", "Next.js"],
            targetLocation: "United Kingdom",
            minExperience: 5,
            candidate: {
                userId: "candidate-1",
                headline: "Senior React Engineer",
                bio: "Frontend engineer shipping TypeScript and Next.js products.",
                skills: ["React", "TypeScript", "Next.js", "Node.js"],
                targetRoles: ["Frontend Engineer", "React Engineer"],
                targetCountries: ["United Kingdom", "Canada"],
                yearsExperience: 6,
                visaStatus: "Eligible for sponsorship and relocation",
                profileCompleteness: 92,
                workHistory: [
                    { company: "Acme", title: "Senior Frontend Engineer", description: "Led React migration", period: "2022-2026" },
                ],
            },
            trust: {
                authenticityScore: 86,
                verifiedSkillCount: 2,
                partnerSignalCount: 1,
                assessmentBacked: true,
                premiumFilterEligible: true,
                fullyCompletedProfile: true,
                riskScore: 8,
            },
            immigrationProcesses: [
                {
                    visaType: "UK Skilled Worker",
                    targetCountry: "United Kingdom",
                    status: "IN_PROGRESS",
                },
            ],
        });
        expect(result.score).toBeGreaterThanOrEqual(60);
        expect(result.semanticScore).toBeGreaterThan(10);
        expect(result.mobility.label).toBe("READY");
        expect(result.reasons.length).toBeGreaterThan(0);
    });
    it("keeps partial profiles reviewable without over-scoring them", () => {
        const result = buildTalentMatch({
            query: "Product designer",
            desiredSkills: ["Figma"],
            targetLocation: "Canada",
            minExperience: 4,
            candidate: {
                userId: "candidate-2",
                headline: "Designer",
                bio: null,
                skills: ["Figma"],
                targetRoles: ["Designer"],
                targetCountries: [],
                yearsExperience: 2,
                visaStatus: null,
                profileCompleteness: 48,
                workHistory: [],
            },
            trust: null,
            immigrationProcesses: [],
        });
        expect(result.score).toBeLessThan(65);
        expect(result.mobility.label).toBe("EARLY");
    });
});
//# sourceMappingURL=match.test.js.map