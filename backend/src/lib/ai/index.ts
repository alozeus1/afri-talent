import crypto from "crypto";
import { ClaudeProvider } from "./claude.js";
import type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData } from "./types.js";
import logger from "../logger.js";

export type { AIProvider, ParsedResume, TailoredResume, ExtractedJobData };

// ── Provider singleton ───────────────────────────────────────────────────────

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — AI features are unavailable");
  }
  if (!_provider) {
    _provider = new ClaudeProvider();
  }
  return _provider;
}

// ── In-memory SHA-256 cache (resets on process restart) ─────────────────────

const _cache = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown): void {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Quota guard ──────────────────────────────────────────────────────────────

const _quota = new Map<string, { count: number; windowStart: number }>();
const QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTA_MAX = 20; // max AI calls per user per hour

function checkQuota(userId: string): void {
  const now = Date.now();
  const entry = _quota.get(userId);

  if (!entry || now - entry.windowStart > QUOTA_WINDOW_MS) {
    _quota.set(userId, { count: 1, windowStart: now });
    return;
  }

  if (entry.count >= QUOTA_MAX) {
    throw new Error("AI quota exceeded — please wait before making more AI-assisted requests");
  }

  entry.count += 1;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function parseResume(
  userId: string,
  resumeText: string
): Promise<ParsedResume> {
  const key = cacheKey("parseResume", resumeText);
  const cached = cacheGet<ParsedResume>(key);
  if (cached) return cached;

  checkQuota(userId);

  logger.info({ userId }, "[ai] parseResume");
  const result = await getAIProvider().parseResume(resumeText);
  cacheSet(key, result);
  return result;
}

export async function tailorResume(
  userId: string,
  resumeText: string,
  jobDescription: string
): Promise<TailoredResume> {
  const key = cacheKey("tailorResume", resumeText, jobDescription);
  const cached = cacheGet<TailoredResume>(key);
  if (cached) return cached;

  checkQuota(userId);

  logger.info({ userId }, "[ai] tailorResume");
  const result = await getAIProvider().tailorResume(resumeText, jobDescription);
  cacheSet(key, result);
  return result;
}

export async function generateCoverLetter(
  userId: string,
  resumeText: string,
  jobDescription: string,
  candidateName: string
): Promise<string> {
  const key = cacheKey("coverLetter", resumeText, jobDescription, candidateName);
  const cached = cacheGet<string>(key);
  if (cached) return cached;

  checkQuota(userId);

  logger.info({ userId }, "[ai] generateCoverLetter");
  const result = await getAIProvider().generateCoverLetter(resumeText, jobDescription, candidateName);
  cacheSet(key, result);
  return result;
}

export async function extractJobData(
  jobText: string
): Promise<ExtractedJobData> {
  const key = cacheKey("extractJob", jobText);
  const cached = cacheGet<ExtractedJobData>(key);
  if (cached) return cached;

  // No per-user quota on job extraction — it's a system operation
  logger.info("[ai] extractJobData");
  const result = await getAIProvider().extractJobData(jobText);
  cacheSet(key, result);
  return result;
}
