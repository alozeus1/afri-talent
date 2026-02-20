import crypto from "crypto";
import { ClaudeProvider } from "./claude.js";
import logger from "../logger.js";
// ── Provider singleton ───────────────────────────────────────────────────────
let _provider = null;
export function getAIProvider() {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set — AI features are unavailable");
    }
    if (!_provider) {
        _provider = new ClaudeProvider();
    }
    return _provider;
}
// ── In-memory SHA-256 cache (resets on process restart) ─────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
function cacheKey(...parts) {
    return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
function cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        _cache.delete(key);
        return null;
    }
    return entry.value;
}
function cacheSet(key, value) {
    _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}
// ── Quota guard ──────────────────────────────────────────────────────────────
const _quota = new Map();
const QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTA_MAX = 20; // max AI calls per user per hour
function checkQuota(userId) {
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
export async function parseResume(userId, resumeText) {
    const key = cacheKey("parseResume", resumeText);
    const cached = cacheGet(key);
    if (cached)
        return cached;
    checkQuota(userId);
    logger.info({ userId }, "[ai] parseResume");
    const result = await getAIProvider().parseResume(resumeText);
    cacheSet(key, result);
    return result;
}
export async function tailorResume(userId, resumeText, jobDescription) {
    const key = cacheKey("tailorResume", resumeText, jobDescription);
    const cached = cacheGet(key);
    if (cached)
        return cached;
    checkQuota(userId);
    logger.info({ userId }, "[ai] tailorResume");
    const result = await getAIProvider().tailorResume(resumeText, jobDescription);
    cacheSet(key, result);
    return result;
}
export async function generateCoverLetter(userId, resumeText, jobDescription, candidateName) {
    const key = cacheKey("coverLetter", resumeText, jobDescription, candidateName);
    const cached = cacheGet(key);
    if (cached)
        return cached;
    checkQuota(userId);
    logger.info({ userId }, "[ai] generateCoverLetter");
    const result = await getAIProvider().generateCoverLetter(resumeText, jobDescription, candidateName);
    cacheSet(key, result);
    return result;
}
export async function extractJobData(jobText) {
    const key = cacheKey("extractJob", jobText);
    const cached = cacheGet(key);
    if (cached)
        return cached;
    // No per-user quota on job extraction — it's a system operation
    logger.info("[ai] extractJobData");
    const result = await getAIProvider().extractJobData(jobText);
    cacheSet(key, result);
    return result;
}
//# sourceMappingURL=index.js.map