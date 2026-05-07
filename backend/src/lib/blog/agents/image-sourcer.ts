// ─────────────────────────────────────────────────────────────────────────────
// ImageSourcerAgent
//
// Fetches a relevant, high-quality cover image for the blog post.
// Priority order: Unsplash → Pexels → null (no image)
//
// Both APIs are free-tier; keys are optional.
// Images are returned as direct CDN URLs (ready for Resource.coverImage).
// ─────────────────────────────────────────────────────────────────────────────

import logger from "../../logger.js";

const log = logger.child({ agent: "ImageSourcerAgent" });

// Default search terms used when no keywords are provided
const DEFAULT_KEYWORDS = ["Africa technology professionals", "remote work laptop"];

// ── Unsplash ──────────────────────────────────────────────────────────────────

interface UnsplashPhoto {
  urls: { regular: string; small: string };
  alt_description: string | null;
  user: { name: string };
}

interface UnsplashResponse {
  results: UnsplashPhoto[];
}

async function fetchUnsplash(query: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "5");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      log.warn({ status: resp.status }, "[ImageSourcerAgent] Unsplash request failed");
      return null;
    }

    const data = (await resp.json()) as UnsplashResponse;
    const photo = data.results?.[0];
    if (!photo) return null;

    log.info({ photographer: photo.user.name, query }, "[ImageSourcerAgent] Unsplash image found");
    return photo.urls.regular;
  } catch (err) {
    log.warn({ err }, "[ImageSourcerAgent] Unsplash error");
    return null;
  }
}

// ── Pexels ────────────────────────────────────────────────────────────────────

interface PexelsPhoto {
  src: { large: string; medium: string };
  photographer: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
}

async function fetchPexels(query: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "5");
    url.searchParams.set("orientation", "landscape");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      log.warn({ status: resp.status }, "[ImageSourcerAgent] Pexels request failed");
      return null;
    }

    const data = (await resp.json()) as PexelsResponse;
    const photo = data.photos?.[0];
    if (!photo) return null;

    log.info({ photographer: photo.photographer, query }, "[ImageSourcerAgent] Pexels image found");
    return photo.src.large;
  } catch (err) {
    log.warn({ err }, "[ImageSourcerAgent] Pexels error");
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function ImageSourcerAgent(keywords: string[]): Promise<string | null> {
  const terms = keywords.length > 0 ? keywords : DEFAULT_KEYWORDS;

  // Build a concise search query from the most relevant keywords
  const query = terms
    .slice(0, 3)
    .join(" ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();

  log.info({ query }, "[ImageSourcerAgent] searching for cover image");

  // Try Unsplash first, fall back to Pexels
  const unsplash = await fetchUnsplash(query);
  if (unsplash) return unsplash;

  const pexels = await fetchPexels(query);
  if (pexels) return pexels;

  // Try simplified query as last resort
  const fallbackQuery = "Africa technology remote work";
  const unsplashFallback = await fetchUnsplash(fallbackQuery);
  if (unsplashFallback) return unsplashFallback;

  const pexelsFallback = await fetchPexels(fallbackQuery);
  if (pexelsFallback) return pexelsFallback;

  log.info("[ImageSourcerAgent] no image found — post will have no cover image");
  return null;
}
