export interface AnswerEvalInput {
    question: string;
    candidateAnswer: string;
    expectedPoints: string[];
    role?: string;
}
export interface AnswerEvalResult {
    score: number;
    feedback: string;
    suggestedAnswer: string;
    talkingPoints: string[];
    strengths: string[];
    improvements: string[];
    source: "ai" | "template";
}
export declare function evaluateInterviewAnswer(input: AnswerEvalInput): Promise<AnswerEvalResult>;
//# sourceMappingURL=interview-answer-evaluator.d.ts.map