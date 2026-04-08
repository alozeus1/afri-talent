import type { SemanticConfig } from "./types.js";
export declare function getSemanticConfig(): SemanticConfig;
export declare function generateHashEmbedding(text: string, dimensions?: number): number[];
export declare function resolveEmbedding(text: string, manualEmbedding?: number[]): Promise<{
    embedding: number[];
    provider: string;
    model: string;
    dimensions: number;
}>;
export declare function cosineSimilarity(left: number[], right: number[]): number;
export declare function semanticTextScore(query: string, target: string): number;
//# sourceMappingURL=embedding.d.ts.map