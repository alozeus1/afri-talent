import { AiRunStatus, AiRunType } from "@prisma/client";
import type { OrchestratorOutput } from "./orchestrator/index.js";
export declare function hashText(text: string): string;
export declare function createAiRun(userId: string, runId: string, runType: string, resumeHash: string, tokenBudgetTotal: number): Promise<void>;
export declare function completeAiRun(runId: string, output: OrchestratorOutput): Promise<void>;
export interface AiRunHistoryItem {
    id: string;
    runId: string;
    runType: AiRunType;
    status: AiRunStatus;
    tokenBudgetTotal: number;
    tokenBudgetUsed: number;
    notes: string[];
    createdAt: Date;
    completedAt: Date | null;
    jobs: Array<{
        jobIndex: number;
        jobTitle: string | null;
        jobCompany: string | null;
        score: number | null;
        mustHavePct: number | null;
        tailoredOutput: unknown;
        coverLetterOutput: unknown;
        guardReport: unknown;
    }>;
}
export declare function getRunHistory(userId: string, limit?: number): Promise<AiRunHistoryItem[]>;
//# sourceMappingURL=persistence.d.ts.map