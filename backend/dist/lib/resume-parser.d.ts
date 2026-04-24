export interface ParsedResumeWorkItem {
    company?: string;
    title?: string;
    period?: string;
    description?: string;
}
export interface ParsedResumeEducationItem {
    institution?: string;
    degree?: string;
    period?: string;
}
export interface ParsedResumeData {
    name?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    summary?: string;
    skills: string[];
    workHistory: ParsedResumeWorkItem[];
    education: ParsedResumeEducationItem[];
    certifications: string[];
    rawText: string;
}
export interface CandidateProfileDraft {
    headline?: string;
    bio?: string;
    skills?: string[];
    targetRoles?: string[];
    yearsExperience?: number;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    workHistory?: ParsedResumeWorkItem[];
    educationHistory?: ParsedResumeEducationItem[];
    certifications?: Array<{
        name?: string;
        issuer?: string;
        credentialUrl?: string;
    }>;
}
export declare function extractResumeText(fileBuffer: Buffer, mimetype: string, fileName: string): Promise<string>;
export declare function parseResumeText(rawText: string): ParsedResumeData;
export declare function toCandidateProfileDraft(parsed: ParsedResumeData): CandidateProfileDraft;
//# sourceMappingURL=resume-parser.d.ts.map