export interface CareerGapInput {
    resumeText: string;
    gapStartDate: string;
    gapEndDate: string;
    context?: string;
    targetRole?: string;
}
export interface CareerGapResult {
    explanation: string;
    framing: string;
    talkingPoints: string[];
    source: "ai" | "template";
}
export declare function explainCareerGap(input: CareerGapInput): Promise<CareerGapResult>;
//# sourceMappingURL=career-gap-explainer.d.ts.map