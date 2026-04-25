export interface JobMatch {
    jobId: string;
    title: string;
    company: string;
    location: string;
    type: string;
    seniority: string;
    slug: string;
    score: number;
    matchMethod: "vector" | "keyword";
    /**
     * One-line human-readable reason the job surfaced for this candidate.
     * Always deterministic — built from matched keywords/score — never fabricated.
     */
    explanation: string;
    /**
     * True if the linked employer has a trust profile past UNVERIFIED.
     * Scraped/source jobs with no employerId always report `false`.
     */
    verifiedEmployer: boolean;
    /** "YES" | "NO" | "UNKNOWN" */
    visaSponsorship: string;
    /** ISO country codes or region strings eligible for this role. */
    eligibleCountries: string[];
    /** 0–100 risk score for the posting (higher = riskier). */
    riskScore: number;
    /** "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" */
    riskLevel: string;
    /** 0–100 quality score for the posting. */
    qualityScore: number;
    /** "TRUSTED" | "SOLID" | "REVIEW" | "THIN" derived from qualityScore. */
    qualityLabel: string;
}
export declare function embedText(text: string): Promise<number[] | null>;
export declare function embedUserResume(userId: string, resumeText: string): Promise<void>;
export declare function findJobMatches(userId: string, limit?: number): Promise<JobMatch[]>;
export declare function embedPublishedJobs(batchSize?: number): Promise<{
    indexed: number;
    errors: number;
}>;
//# sourceMappingURL=job-matcher.d.ts.map