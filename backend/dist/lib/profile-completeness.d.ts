export interface ProfileCompletenessInput {
    headline?: string | null;
    bio?: string | null;
    skills: string[];
    targetRoles: string[];
    targetCountries: string[];
    yearsExperience?: number | null;
    visaStatus?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    portfolioUrl?: string | null;
    workHistory?: unknown;
    educationHistory?: unknown;
    certifications?: unknown;
    resumes?: {
        id: string;
    }[];
}
export declare function computeProfileCompleteness(profile: ProfileCompletenessInput): number;
//# sourceMappingURL=profile-completeness.d.ts.map