// ─────────────────────────────────────────────────────────────────────────────
// Blog Automation — shared types for all 5 pipeline agents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a sourced item should be treated by the writer:
 *  - article       → citable editorial/news content
 *  - job_listing   → market demand signal; never cited in the Sources section
 *  - internal_data → AfriTalent platform data (ground truth)
 */
export type SourceType = "article" | "job_listing" | "internal_data";

export interface RawContent {
  title: string;
  url: string;
  excerpt: string;
  sourceName: string;
  sourceDomain: string;
  sourceType: SourceType;
  publishedAt: string;
  relevanceScore: number;
}

export interface VerifiedContent extends RawContent {
  credibilityScore: number;
  verificationNotes: string;
  keyFacts: string[];
}

export interface DraftPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string; // markdown
  category: string;
  sources: Array<{ name: string; url: string }>;
  topicKeywords: string[];
  estimatedReadMinutes: number;
}

export interface BlogPipelineResult {
  success: boolean;
  resourceId?: string;
  title?: string;
  rawContentCount: number;
  verifiedContentCount: number;
  skippedReason?: string;
  error?: string;
  durationMs: number;
}

export const BLOG_CATEGORY = "Weekly Hiring Trends";

export const CREDIBILITY_WHITELIST = new Set([
  "linkedin.com",
  "techcrunch.com",
  "weforum.org",
  "ilostat.ilo.org",
  "worldbank.org",
  "mckinsey.com",
  "glassdoor.com",
  "statista.com",
  "stackoverflow.blog",
  "stackoverflow.com",
  "github.blog",
  "dev.to",
  "hacker-news.firebaseio.com",
  "news.ycombinator.com",
  "weworkremotely.com",
  "remote.co",
  "remoteok.com",
  "jobberman.com",
  "africanews.com",
  "bbc.com",
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "theafricareport.com",
  "ventureburn.com",
  "disrupt-africa.com",
  "techcabal.com",
]);

export const AFRICA_RELEVANCE_KEYWORDS = [
  "africa",
  "african",
  "remote",
  "hiring",
  "global",
  "talent",
  "tech jobs",
  "developer",
  "engineer",
  "skills gap",
  "digital",
  "workforce",
  "employment",
  "diaspora",
  "emerging markets",
  "fintech",
  "nigeria",
  "kenya",
  "ghana",
  "south africa",
  "ethiopia",
  "egypt",
  "rwanda",
];
