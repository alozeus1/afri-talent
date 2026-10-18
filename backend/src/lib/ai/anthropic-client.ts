// ─────────────────────────────────────────────────────────────────────────────
// Shared Anthropic client.
//
// Every AI call site uses this singleton so they all get a bounded timeout and
// a single retry. SDK defaults are a 10-minute timeout and 2 retries, which
// lets a synchronous HTTP handler hang far past the ALB/CloudFront timeout
// while still spending tokens.
//
// Callers keep their own "no API key" handling (deterministic fallbacks, 503s,
// etc.) and must check process.env.ANTHROPIC_API_KEY before calling this when
// they need to. Constructing the client without a key does not throw; the
// request would fail at call time.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_TIMEOUT_MS = 45_000;

let _client: Anthropic | null = null;

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: resolveTimeoutMs(),
      maxRetries: 1,
    });
  }
  return _client;
}

/** Test-only: drop the cached client so env changes take effect. */
export function resetAnthropicClientForTests(): void {
  _client = null;
}
