import type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData } from "./types.js";
export declare class ClaudeProvider implements AIProvider {
    private client;
    constructor();
    private complete;
    private parseJSON;
    parseResume(resumeText: string): Promise<ParsedResume>;
    tailorResume(resumeText: string, jobDescription: string): Promise<TailoredResume>;
    generateCoverLetter(resumeText: string, jobDescription: string, candidateName: string): Promise<string>;
    extractJobData(rawJobText: string): Promise<ExtractedJobData>;
}
//# sourceMappingURL=claude.d.ts.map