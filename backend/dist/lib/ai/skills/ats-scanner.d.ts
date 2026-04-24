export interface AtsScanInput {
    resumeText: string;
    jobDescription: string;
}
export interface AtsScanResult {
    score: number;
    missingKeywords: string[];
    presentKeywords: string[];
    suggestions: string[];
    source: "ai" | "template";
}
export declare function scanResumeAts(input: AtsScanInput): Promise<AtsScanResult>;
//# sourceMappingURL=ats-scanner.d.ts.map