export interface CareerAdvisorInput {
    resumeText: string;
    targetRole: string;
    yearsExperience: number;
    currentSkills: string[];
    recentJobTitles: string[];
}
export interface CareerAdviceResult {
    skillGaps: Array<{
        skill: string;
        priority: "high" | "medium" | "low";
        reason: string;
    }>;
    careerPaths: Array<{
        title: string;
        timeline: string;
        description: string;
    }>;
    certifications: Array<{
        name: string;
        provider: string;
        rationale: string;
    }>;
    salaryRange: {
        min: number;
        max: number;
        currency: string;
        market: string;
    };
    actionPlan: Array<{
        week: string;
        action: string;
    }>;
    summary: string;
}
export declare function analyseCareer(input: CareerAdvisorInput): Promise<CareerAdviceResult>;
//# sourceMappingURL=career-advisor.d.ts.map