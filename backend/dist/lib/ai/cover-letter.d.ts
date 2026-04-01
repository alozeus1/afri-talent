interface CoverLetterInput {
    candidateName: string;
    headline?: string | null;
    skills: string[];
    bio?: string | null;
    yearsExperience?: number | null;
    jobTitle: string;
    companyName: string;
    jobDescription: string;
}
interface CoverLetterResult {
    coverLetter: string;
    source: "ai" | "template";
}
export declare function generateQuickCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult>;
export {};
//# sourceMappingURL=cover-letter.d.ts.map