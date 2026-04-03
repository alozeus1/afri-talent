import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../prisma.js";
import {
  buildJobSemanticContent,
  buildJobSemanticMetadata,
  isSemanticJobIndexable,
  JOB_SEMANTIC_NAMESPACE,
  JOB_SEMANTIC_SOURCE_TYPE,
  semanticJobSelect,
} from "./job-documents.js";
import { cosineSimilarity, getSemanticConfig, resolveEmbedding } from "./embedding.js";
import type {
  SemanticDocumentInput,
  SemanticIndexResult,
  SemanticSearchHit,
  SemanticSearchInput,
} from "./types.js";

function checksumForContent(input: Pick<SemanticDocumentInput, "title" | "content" | "metadata">): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      title: input.title ?? "",
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    .digest("hex");
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.round(value)));
}

export async function getSemanticOverview() {
  const [totalDocuments, namespaceCounts] = await Promise.all([
    prisma.semanticDocument.count(),
    prisma.semanticDocument.groupBy({
      by: ["namespace"],
      _count: { _all: true },
    }),
  ]);

  return {
    ...getSemanticConfig(),
    totalDocuments,
    namespaces: namespaceCounts.map((entry) => ({
      namespace: entry.namespace,
      count: entry._count._all,
    })),
  };
}

export async function upsertSemanticDocument(input: SemanticDocumentInput): Promise<SemanticIndexResult> {
  const checksum = checksumForContent(input);
  const existing = await prisma.semanticDocument.findUnique({
    where: {
      namespace_sourceType_sourceId: {
        namespace: input.namespace,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
  });

  if (existing && existing.checksum === checksum) {
    const unchanged = await prisma.semanticDocument.update({
      where: { id: existing.id },
      data: { lastIndexedAt: new Date() },
    });

    return {
      id: unchanged.id,
      namespace: unchanged.namespace,
      sourceType: unchanged.sourceType,
      sourceId: unchanged.sourceId,
      status: "unchanged",
      checksum,
      embeddingProvider: unchanged.embeddingProvider,
      embeddingModel: unchanged.embeddingModel,
      embeddingDimensions: unchanged.embeddingDimensions,
      lastIndexedAt: unchanged.lastIndexedAt,
    };
  }

  const embeddingInfo = resolveEmbedding(input.content, input.embedding);

  const payload: Prisma.SemanticDocumentUncheckedCreateInput = {
    namespace: input.namespace,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title ?? null,
    content: input.content,
    metadata: input.metadata === undefined
      ? undefined
      : input.metadata === null
        ? Prisma.JsonNull
        : input.metadata as Prisma.InputJsonValue,
    embedding: embeddingInfo.embedding,
    embeddingDimensions: embeddingInfo.dimensions,
    embeddingProvider: embeddingInfo.provider,
    embeddingModel: embeddingInfo.model,
    checksum,
    lastIndexedAt: new Date(),
  };

  const record = existing
    ? await prisma.semanticDocument.update({
      where: { id: existing.id },
      data: payload,
    })
    : await prisma.semanticDocument.create({ data: payload });

  return {
    id: record.id,
    namespace: record.namespace,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    status: existing ? "updated" : "created",
    checksum,
    embeddingProvider: record.embeddingProvider,
    embeddingModel: record.embeddingModel,
    embeddingDimensions: record.embeddingDimensions,
    lastIndexedAt: record.lastIndexedAt,
  };
}

export async function searchSemanticDocuments(input: SemanticSearchInput): Promise<SemanticSearchHit[]> {
  const queryEmbedding = resolveEmbedding(input.query).embedding;
  const limit = clampLimit(input.limit, 10, 50);
  const candidateLimit = clampLimit(input.candidateLimit, Math.max(limit * 8, 50), 500);
  const minScore = typeof input.minScore === "number" ? input.minScore : 0.2;

  const documents = await prisma.semanticDocument.findMany({
    where: {
      namespace: input.namespace,
      sourceType: input.sourceTypes?.length ? { in: input.sourceTypes } : undefined,
    },
    orderBy: { updatedAt: "desc" },
    take: candidateLimit,
  });

  return documents
    .map((document) => ({
      id: document.id,
      namespace: document.namespace,
      sourceType: document.sourceType,
      sourceId: document.sourceId,
      title: document.title,
      content: document.content,
      metadata: document.metadata,
      score: cosineSimilarity(queryEmbedding, document.embedding),
      embeddingDimensions: document.embeddingDimensions,
      updatedAt: document.updatedAt,
    }))
    .filter((document) => document.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function indexPublishedJobs(limit = 100, offset = 0) {
  const take = clampLimit(limit, 100, 500);
  const skip = Math.max(0, Math.round(offset));

  const jobs = await prisma.job.findMany({
    where: {
      status: "PUBLISHED",
      isExpired: false,
    },
    select: semanticJobSelect,
    orderBy: [
      { publishedAt: "desc" },
      { updatedAt: "desc" },
    ],
    take,
    skip,
  });

  const indexableJobs = jobs.filter(isSemanticJobIndexable);
  const results = await Promise.all(indexableJobs.map((job) => upsertSemanticDocument({
    namespace: JOB_SEMANTIC_NAMESPACE,
    sourceType: JOB_SEMANTIC_SOURCE_TYPE,
    sourceId: job.id,
    title: job.title,
    content: buildJobSemanticContent(job),
    metadata: buildJobSemanticMetadata(job),
  })));

  return {
    scanned: jobs.length,
    indexed: results.length,
    created: results.filter((result) => result.status === "created").length,
    updated: results.filter((result) => result.status === "updated").length,
    unchanged: results.filter((result) => result.status === "unchanged").length,
  };
}
