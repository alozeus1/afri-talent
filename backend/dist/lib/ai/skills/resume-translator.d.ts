export type SupportedTranslationLanguage = "fr" | "pt" | "ar" | "sw" | "es";
export declare const LANGUAGE_NAMES: Record<SupportedTranslationLanguage, string>;
export interface ResumeTranslateInput {
    resumeText: string;
    targetLanguage: SupportedTranslationLanguage;
}
export interface ResumeTranslateResult {
    translatedText: string;
    targetLanguage: SupportedTranslationLanguage;
    languageName: string;
    source: "ai" | "template";
}
export declare function translateResume(input: ResumeTranslateInput): Promise<ResumeTranslateResult>;
//# sourceMappingURL=resume-translator.d.ts.map