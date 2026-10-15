// ─────────────────────────────────────────────────────────────────────────────
// Polite HTTP client for the aggregator engine.
//
//  - Identifying User-Agent on every request.
//  - robots.txt honoured per origin (cached), Crawl-delay respected.
//  - Per-host request spacing (serialised per host).
//  - Per-request timeout + caller abort signal (per-source time budget).
//  - Retries with exponential backoff + jitter on network errors, 429 and 5xx,
//    honouring Retry-After.
//  - Conditional requests (ETag / Last-Modified): a 304 returns the cached body
//    with `notModified: true`, so unchanged feeds cost one cheap round-trip.
// ─────────────────────────────────────────────────────────────────────────────

import { ALLOW_ALL, DISALLOW_ALL, isAllowed, parseRobots, type RobotsPolicy } from "./robots.js";

export const AGGREGATOR_PRODUCT_TOKEN = "AfriTalentBot";
export const DEFAULT_USER_AGENT =
  process.env.AGGREGATOR_USER_AGENT?.trim() ||
  `${AGGREGATOR_PRODUCT_TOKEN}/2.0 (+https://afri-talent.com; job aggregator for African talent)`;

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export class RobotsDisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export interface HttpGetOptions {
  accept?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** Skip robots.txt (keyed APIs used under an explicit developer agreement). */
  robotsExempt?: boolean;
  /** Send If-None-Match / If-Modified-Since when we have validators. Default true. */
  conditional?: boolean;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: string;
  notModified: boolean;
}

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  body: string;
}

export interface HttpClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
  defaultTimeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  minHostIntervalMs?: number;
  /** Hosts whose robots.txt the operator has explicitly waived (comma env). */
  robotsExemptHosts?: string[];
  /** Upper bound on conditional-cache bodies kept in memory. */
  maxCacheBytes?: number;
}

const ROBOTS_TTL_MS = 12 * 60 * 60 * 1000;
const ROBOTS_FAILURE_TTL_MS = 30 * 60 * 1000;
const MAX_CRAWL_DELAY_MS = 10_000;
const MAX_RETRY_AFTER_MS = 30_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  readonly userAgent: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly minHostIntervalMs: number;
  private readonly robotsExemptHosts: Set<string>;
  private readonly maxCacheBytes: number;

  private readonly robotsCache = new Map<string, { policy: RobotsPolicy; expiresAt: number }>();
  private readonly hostQueues = new Map<string, Promise<void>>();
  private readonly hostNextAt = new Map<string, number>();
  private readonly cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  requestCount = 0;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
    this.minHostIntervalMs = options.minHostIntervalMs ?? 250;
    this.robotsExemptHosts = new Set(
      (options.robotsExemptHosts ?? (process.env.AGGREGATOR_ROBOTS_EXEMPT_HOSTS || "").split(","))
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    this.maxCacheBytes = options.maxCacheBytes ?? 64 * 1024 * 1024;
  }

  async getJson<T>(url: string, options: HttpGetOptions = {}): Promise<{ data: T; notModified: boolean }> {
    const response = await this.get(url, { accept: "application/json", ...options });
    try {
      return { data: JSON.parse(response.body) as T, notModified: response.notModified };
    } catch {
      throw new Error(`Invalid JSON from ${url}`);
    }
  }

  async get(url: string, options: HttpGetOptions = {}): Promise<HttpResponse> {
    const parsed = new URL(url);
    if (!options.robotsExempt && !this.robotsExemptHosts.has(parsed.host.toLowerCase())) {
      const policy = await this.robotsFor(parsed, options.signal);
      if (!isAllowed(policy, `${parsed.pathname}${parsed.search}`)) {
        throw new RobotsDisallowedError(url);
      }
    }

    const cached = options.conditional === false ? undefined : this.cache.get(url);
    const retries = options.retries ?? this.maxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (options.signal?.aborted) throw new Error(`Aborted: source time budget exhausted (${url})`);
      await this.waitForHost(parsed.host);

      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        Accept: options.accept ?? "*/*",
        ...(options.headers ?? {}),
      };
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

      const timeout = AbortSignal.timeout(options.timeoutMs ?? this.defaultTimeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      let retryAfterMs: number | null = null;
      try {
        this.requestCount += 1;
        const response = await this.fetchImpl(url, { headers, signal, redirect: "follow" });

        if (response.status === 304 && cached) {
          return { status: 304, body: cached.body, notModified: true };
        }

        if (response.ok) {
          const body = await response.text();
          this.remember(url, response.headers.get("etag"), response.headers.get("last-modified"), body);
          return { status: response.status, body, notModified: false };
        }

        lastError = new HttpError(response.status, url);
        if (!isRetryableStatus(response.status)) throw lastError;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      } catch (error) {
        if (error instanceof HttpError && !isRetryableStatus(error.status)) throw error;
        if (options.signal?.aborted) throw new Error(`Aborted: source time budget exhausted (${url})`);
        lastError = error;
      }

      if (attempt < retries) {
        const backoff = this.baseBackoffMs * 2 ** attempt;
        const jitter = Math.random() * this.baseBackoffMs;
        await this.sleep(Math.min(retryAfterMs ?? backoff + jitter, MAX_RETRY_AFTER_MS));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private remember(url: string, etag: string | null, lastModified: string | null, body: string): void {
    if (!etag && !lastModified) return;
    const previous = this.cache.get(url);
    if (previous) this.cacheBytes -= previous.body.length;
    if (body.length > this.maxCacheBytes / 4) {
      this.cache.delete(url);
      return;
    }
    this.cache.set(url, { etag: etag ?? undefined, lastModified: lastModified ?? undefined, body });
    this.cacheBytes += body.length;
    // Evict oldest entries (Map preserves insertion order) until under budget.
    for (const [key, entry] of this.cache) {
      if (this.cacheBytes <= this.maxCacheBytes) break;
      this.cache.delete(key);
      this.cacheBytes -= entry.body.length;
    }
  }

  private async waitForHost(host: string): Promise<void> {
    const previous = this.hostQueues.get(host) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.hostQueues.set(host, previous.then(() => next));
    await previous;
    const waitMs = (this.hostNextAt.get(host) ?? 0) - Date.now();
    if (waitMs > 0) await this.sleep(waitMs);
    const policy = this.robotsCache.get(host)?.policy;
    const crawlDelayMs = Math.min((policy?.crawlDelaySeconds ?? 0) * 1000, MAX_CRAWL_DELAY_MS);
    this.hostNextAt.set(host, Date.now() + Math.max(this.minHostIntervalMs, crawlDelayMs));
    release();
  }

  private async robotsFor(url: URL, signal?: AbortSignal): Promise<RobotsPolicy> {
    const key = url.host;
    const cached = this.robotsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.policy;

    let policy: RobotsPolicy;
    let ttl = ROBOTS_TTL_MS;
    try {
      const timeout = AbortSignal.timeout(10_000);
      const response = await this.fetchImpl(`${url.protocol}//${url.host}/robots.txt`, {
        headers: { "User-Agent": this.userAgent, Accept: "text/plain" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        redirect: "follow",
      });
      this.requestCount += 1;
      if (response.ok) {
        policy = parseRobots(await response.text(), AGGREGATOR_PRODUCT_TOKEN);
      } else if (response.status >= 400 && response.status < 500) {
        policy = ALLOW_ALL;
      } else {
        policy = DISALLOW_ALL;
        ttl = ROBOTS_FAILURE_TTL_MS;
      }
    } catch {
      policy = DISALLOW_ALL;
      ttl = ROBOTS_FAILURE_TTL_MS;
    }

    this.robotsCache.set(key, { policy, expiresAt: Date.now() + ttl });
    return policy;
  }
}

let sharedClient: HttpClient | null = null;

/** Process-wide client so the conditional cache + robots cache survive across cron runs. */
export function getSharedHttpClient(): HttpClient {
  if (!sharedClient) sharedClient = new HttpClient();
  return sharedClient;
}
