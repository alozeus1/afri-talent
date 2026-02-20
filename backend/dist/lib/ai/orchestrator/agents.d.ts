import type { ResumeSchema, JobSchema, MatchSchema, TailoredResumeSchema, CoverLetterPackSchema, GuardReportSchema, CandidateProfile } from "./types.js";
export declare function estimateTokens(text: string): number;
interface AgentCallResult<T> {
    data: T;
    token_estimate: number;
}
export declare function ResumeParserAgent(resumeText: string): Promise<AgentCallResult<ResumeSchema>>;
export declare function JobParserAgent(rawJobText: string): Promise<AgentCallResult<JobSchema>>;
export declare function MatchScorerAgent(resume: ResumeSchema, job: JobSchema, candidateProfile?: CandidateProfile): Promise<AgentCallResult<MatchSchema>>;
export declare function ResumeTailorAgent(resume: ResumeSchema, job: JobSchema): Promise<AgentCallResult<TailoredResumeSchema>>;
export declare function CoverLetterAgent(resume: ResumeSchema, job: JobSchema, tailoredResume: TailoredResumeSchema): Promise<AgentCallResult<CoverLetterPackSchema>>;
export declare function TruthConsistencyGuardAgent(originalResume: ResumeSchema, tailoredResume: TailoredResumeSchema, coverLetter: CoverLetterPackSchema): Promise<AgentCallResult<GuardReportSchema>>;
export {};
//# sourceMappingURL=agents.d.ts.map