import type { SemanticDocumentInput, SemanticIndexResult, SemanticSearchHit, SemanticSearchInput } from "./types.js";
export declare function getSemanticOverview(): Promise<{
    totalDocuments: number;
    namespaces: {
        namespace: string;
        count: number;
    }[];
    enabled: boolean;
    provider: string;
    model: string;
    dimensions: number;
}>;
export declare function upsertSemanticDocument(input: SemanticDocumentInput): Promise<SemanticIndexResult>;
export declare function searchSemanticDocuments(input: SemanticSearchInput): Promise<SemanticSearchHit[]>;
export declare function indexPublishedJobs(limit?: number, offset?: number): Promise<{
    scanned: number;
    indexed: number;
    created: number;
    updated: number;
    unchanged: number;
}>;
export declare function indexOpenCandidates(limit?: number, offset?: number): Promise<{
    scanned: number;
    indexed: number;
    created: number;
    updated: number;
    unchanged: number;
}>;
//# sourceMappingURL=store.d.ts.map