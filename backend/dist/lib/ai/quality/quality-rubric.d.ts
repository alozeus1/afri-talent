export type QualityGrade = "PASS" | "WARN" | "FAIL";
export type IssueSeverity = "info" | "warn" | "error";
export interface QualityIssue {
    code: string;
    severity: IssueSeverity;
    message: string;
    evidence?: string;
}
export interface QualityReport {
    grade: QualityGrade;
    score: number;
    issues: QualityIssue[];
    stats: {
        words: number;
        sentences: number;
        avgSentenceWords: number;
        bannedPhraseHits: number;
        fillerHits: number;
        quantifiedAchievements: number;
        placeholderHits: number;
    };
}
export interface RubricInputs {
    text: string;
    kind: "resume" | "cover_letter" | "match_explanation" | "generic";
    expectedKeywords?: string[];
}
/**
 * Grade AI output. Pure function — no I/O.
 */
export declare function gradeAiOutput(input: RubricInputs): QualityReport;
/**
 * Helper: format a QualityReport as a single short status line for logging.
 */
export declare function formatReportLine(report: QualityReport): string;
//# sourceMappingURL=quality-rubric.d.ts.map