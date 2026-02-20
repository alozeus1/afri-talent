import type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData } from "./types.js";
export type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData };
export declare function getAIProvider(): AIProvider;
export declare function parseResume(userId: string, resumeText: string): Promise<ParsedResume>;
export declare function tailorResume(userId: string, resumeText: string, jobDescription: string): Promise<TailoredResume>;
export declare function generateCoverLetter(userId: string, resumeText: string, jobDescription: string, candidateName: string): Promise<string>;
export declare function extractJobData(jobText: string): Promise<ExtractedJobData>;
//# sourceMappingURL=index.d.ts.map