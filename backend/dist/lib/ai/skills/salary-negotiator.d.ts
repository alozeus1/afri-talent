export interface SalaryNegotiationInput {
    role: string;
    location: string;
    yearsExperience: number;
    offeredSalary?: number;
    offeredCurrency?: string;
    targetSalary?: number;
    skills?: string[];
}
export interface SalaryNegotiationResult {
    recommendedRange: {
        min: number;
        max: number;
        currency: string;
    };
    talkingPoints: string[];
    benefitsToNegotiate: string[];
    negotiationScript: string;
    source: "ai" | "template";
}
export declare function generateNegotiationGuidance(input: SalaryNegotiationInput): Promise<SalaryNegotiationResult>;
//# sourceMappingURL=salary-negotiator.d.ts.map