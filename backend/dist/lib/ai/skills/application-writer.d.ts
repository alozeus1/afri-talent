export interface ApplicationWriterInput {
    candidateName: string;
    resumeText: string;
    jobTitle: string;
    jobCompany: string;
    jobDescription: string;
    tone?: "professional" | "conversational" | "executive";
}
export interface GeneratedApplication {
    coverLetter: string;
    source: "ai" | "template";
}
export declare function writeCoverLetter(input: ApplicationWriterInput): Promise<GeneratedApplication>;
//# sourceMappingURL=application-writer.d.ts.map