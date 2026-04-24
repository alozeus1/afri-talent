import { CandidateAgentTaskStatus, CandidateAgentTaskType, Prisma, ResumeVersionSource, ResumeVersionStatus, type Application, type CandidateAutopilotProfile, type CandidateProfile, type Job, type User } from "@prisma/client";
type JsonRecord = Record<string, unknown>;
export interface ResumeBuildInput {
    user: Pick<User, "id" | "name" | "email">;
    profile: CandidateProfile;
    job?: Pick<Job, "id" | "title" | "description" | "tags" | "sourceName"> | null;
    source?: ResumeVersionSource;
    aiRunId?: string | null;
    autopilotProfileId?: string | null;
}
export interface FollowUpDraft {
    taskId: string;
    cadenceDays: number;
    subject: string;
    body: string;
    timingGuidance: string;
    needsHumanReview: boolean;
}
export interface InterviewPrepPack {
    taskId: string;
    focusAreas: string[];
    likelyQuestions: string[];
    candidateStories: string[];
    recruiterReplyDraft: string;
    schedulingNotes: string[];
}
export interface CandidatePipelineSnapshot {
    settings: CandidateAutopilotProfile;
    latestResumeVersion: {
        id: string;
        title: string;
        status: ResumeVersionStatus;
        targetRole: string | null;
        updatedAt: Date;
    } | null;
    taskSummary: {
        queued: number;
        needsReview: number;
        ready: number;
        completed: number;
    };
}
export declare function buildTaskTitle(type: CandidateAgentTaskType, jobTitle?: string | null): string;
export declare function ensureCandidateAutopilotProfile(userId: string): Promise<CandidateAutopilotProfile>;
export declare function buildResumeVersion(input: ResumeBuildInput): Promise<{
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    source: import(".prisma/client").$Enums.ResumeVersionSource;
    status: import(".prisma/client").$Enums.ResumeVersionStatus;
    profileId: string | null;
    title: string;
    notes: string[];
    summary: string | null;
    score: number | null;
    jobId: string | null;
    content: Prisma.JsonValue;
    keywords: string[];
    aiRunId: string | null;
    targetRole: string | null;
    autopilotProfileId: string | null;
    plainText: string;
    isPrimary: boolean;
}>;
export declare function queueCandidateAgentTask(input: {
    userId: string;
    type: CandidateAgentTaskType;
    jobId?: string | null;
    applicationId?: string | null;
    aiRunId?: string | null;
    resumeVersionId?: string | null;
    priority?: number;
    title?: string;
    summary?: string | null;
    inputSnapshot?: JsonRecord | null;
    outputSummary?: JsonRecord | null;
    outputPayload?: JsonRecord | null;
    status?: CandidateAgentTaskStatus;
    scheduledFor?: Date | null;
}): Promise<{
    type: import(".prisma/client").$Enums.CandidateAgentTaskType;
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    status: import(".prisma/client").$Enums.CandidateAgentTaskStatus;
    title: string;
    summary: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    jobId: string | null;
    applicationId: string | null;
    priority: number;
    aiRunId: string | null;
    autopilotProfileId: string | null;
    resumeVersionId: string | null;
    inputSnapshot: Prisma.JsonValue | null;
    outputSummary: Prisma.JsonValue | null;
    outputPayload: Prisma.JsonValue | null;
    reviewNotes: string | null;
    scheduledFor: Date | null;
    lastError: string | null;
}>;
export declare function buildFollowUpDraft(input: {
    user: Pick<User, "id" | "name">;
    application: Pick<Application, "id" | "createdAt" | "status">;
    job: Pick<Job, "id" | "title" | "sourceName" | "applicationUrl" | "sourceUrl">;
}): Promise<FollowUpDraft[]>;
export declare function buildInterviewPrepPack(input: {
    user: Pick<User, "id" | "name">;
    profile: CandidateProfile;
    application: Pick<Application, "id" | "status">;
    job: Pick<Job, "id" | "title" | "description" | "tags" | "sourceName">;
}): Promise<InterviewPrepPack>;
export declare function getCandidatePipelineSnapshot(userId: string): Promise<CandidatePipelineSnapshot>;
export {};
//# sourceMappingURL=framework.d.ts.map