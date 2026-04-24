export interface ResumeInput {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    targetRole: string;
    yearsExperience: number;
    summary?: string;
    skills: string[];
    workHistory: Array<{
        company: string;
        title: string;
        period: string;
        description?: string;
    }>;
    educationHistory: Array<{
        institution: string;
        degree: string;
        period?: string;
    }>;
    certifications?: string[];
}
export interface GeneratedResume {
    sections: {
        summary: string;
        skills: string[];
        experience: Array<{
            company: string;
            title: string;
            period: string;
            bullets: string[];
        }>;
        education: Array<{
            institution: string;
            degree: string;
            period: string;
        }>;
        certifications: string[];
    };
    rawText: string;
    source: "ai" | "template";
}
export declare function buildResume(input: ResumeInput): Promise<GeneratedResume>;
//# sourceMappingURL=resume-builder.d.ts.map