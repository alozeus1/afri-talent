export interface InterviewQuestionInput {
    role: string;
    difficulty: "easy" | "medium" | "hard";
    count: number;
    jobDescription?: string;
}
export interface InterviewQuestion {
    question: string;
    category: "behavioral" | "technical" | "situational" | "cultural";
    difficulty: "easy" | "medium" | "hard";
    expectedPoints: string[];
}
export interface InterviewQuestionsResult {
    questions: InterviewQuestion[];
    source: "ai" | "template";
}
export declare function generateInterviewQuestions(input: InterviewQuestionInput): Promise<InterviewQuestionsResult>;
//# sourceMappingURL=interview-question-generator.d.ts.map