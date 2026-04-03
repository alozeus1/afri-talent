import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  getSemanticOverview,
  indexPublishedJobs,
  searchSemanticDocuments,
  upsertSemanticDocument,
} from "../lib/rag/store.js";
import { JOB_SEMANTIC_NAMESPACE, JOB_SEMANTIC_SOURCE_TYPE } from "../lib/rag/job-documents.js";

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

const documentSchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  sourceType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(191),
  title: z.string().trim().max(300).optional().nullable(),
  content: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  embedding: z.array(z.number().finite()).min(1).max(1024).optional(),
});

const searchSchema = z.object({
  namespace: z.string().trim().min(1).max(100),
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  candidateLimit: z.number().int().min(1).max(500).optional(),
  minScore: z.number().min(0).max(1).optional(),
  sourceTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

const jobIndexSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const overview = await getSemanticOverview();
    res.json({ semantic: overview });
  } catch (error) {
    console.error("Semantic status error:", error);
    res.status(500).json({ error: "Failed to load semantic status" });
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  try {
    const payload = documentSchema.parse(req.body);
    const result = await upsertSemanticDocument(payload);
    res.status(201).json({ document: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid semantic document payload", issues: error.issues });
      return;
    }
    console.error("Semantic document indexing error:", error);
    res.status(500).json({ error: "Failed to index semantic document" });
  }
});

router.post("/search", async (req: Request, res: Response) => {
  try {
    const payload = searchSchema.parse(req.body);
    const results = await searchSemanticDocuments(payload);
    res.json({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid semantic search payload", issues: error.issues });
      return;
    }
    console.error("Semantic search error:", error);
    res.status(500).json({ error: "Failed to search semantic documents" });
  }
});

router.post("/index/jobs", async (req: Request, res: Response) => {
  try {
    const payload = jobIndexSchema.parse(req.body ?? {});
    const result = await indexPublishedJobs(payload.limit, payload.offset);
    res.json({
      namespace: JOB_SEMANTIC_NAMESPACE,
      sourceType: JOB_SEMANTIC_SOURCE_TYPE,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid job indexing payload", issues: error.issues });
      return;
    }
    console.error("Semantic job indexing error:", error);
    res.status(500).json({ error: "Failed to index jobs for semantic search" });
  }
});

export default router;
