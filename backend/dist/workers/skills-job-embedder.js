// ─────────────────────────────────────────────────────────────────────────────
// Skills Job Embedder Worker (Skill 5)
//
// Runs after each aggregation cycle and on its own schedule.
// Embeds all newly scraped / unembedded published jobs into the pgvector
// embedding column on the Job table using OpenAI text-embedding-3-small.
//
// This is additive — it only populates Jobs that have embedding IS NULL.
// ─────────────────────────────────────────────────────────────────────────────
import logger from "../lib/logger.js";
import { embedPublishedJobs } from "../lib/ai/skills/job-matcher.js";
const SKILLS_ENABLED = process.env.SKILLS_ENABLED !== "false";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EMBED_BATCH_SIZE = Math.min(parseInt(process.env.SKILLS_EMBED_BATCH_SIZE || "50", 10), 200);
export async function runSkillsJobEmbedder() {
    if (!SKILLS_ENABLED) {
        logger.debug("[skills-job-embedder] skipped — SKILLS_ENABLED=false");
        return;
    }
    if (!OPENAI_API_KEY) {
        logger.debug("[skills-job-embedder] skipped — OPENAI_API_KEY not set");
        return;
    }
    logger.info({ batchSize: EMBED_BATCH_SIZE }, "[skills-job-embedder] starting embedding cycle");
    const { indexed, errors } = await embedPublishedJobs(EMBED_BATCH_SIZE);
    logger.info({ indexed, errors }, "[skills-job-embedder] embedding cycle complete");
}
//# sourceMappingURL=skills-job-embedder.js.map