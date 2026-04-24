export interface SemanticDocumentInput {
  namespace: string;
  sourceType: string;
  sourceId: string;
  title?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
  embedding?: number[];
}

export interface SemanticSearchInput {
  namespace: string;
  query: string;
  limit?: number;
  candidateLimit?: number;
  minScore?: number;
  sourceTypes?: string[];
}

export interface SemanticSearchHit {
  id: string;
  namespace: string;
  sourceType: string;
  sourceId: string;
  title: string | null;
  content: string;
  metadata: unknown;
  score: number;
  embeddingDimensions: number;
  updatedAt: Date;
}

export interface SemanticIndexResult {
  id: string;
  namespace: string;
  sourceType: string;
  sourceId: string;
  status: "created" | "updated" | "unchanged";
  checksum: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  lastIndexedAt: Date;
}

export interface SemanticConfig {
  enabled: boolean;
  provider: string;
  model: string;
  dimensions: number;
}
