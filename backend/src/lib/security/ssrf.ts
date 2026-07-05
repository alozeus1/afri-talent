// ─────────────────────────────────────────────────────────────────────────────
// SSRF protection for server-side fetches of user-supplied URLs.
//
// Any endpoint that fetches a URL the caller controls (job extraction, URL
// previews, avatar imports, …) must route through `safePublicFetch` so it can
// never be pointed at cloud metadata (169.254.169.254), loopback, RDS Proxy,
// or other VPC-internal services reachable from the ECS task.
//
// Strategy: validate protocol + resolve DNS and reject any private/reserved IP
// on EVERY hop, following redirects manually so a public URL cannot 3xx-bounce
// to an internal host.
// ─────────────────────────────────────────────────────────────────────────────

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true;                            // 0.0.0.0/8 "this network"
  if (a === 10) return true;                           // 10.0.0.0/8 private
  if (a === 127) return true;                          // loopback
  if (a === 169 && b === 254) return true;             // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;               // 192.0.0.0/24, 192.0.2.0/24 (docs/test)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51) return true;              // 198.51.100.0/24 (docs/test)
  if (a === 203 && b === 0) return true;               // 203.0.113.0/24 (docs/test)
  if (a >= 224) return true;                           // 224.0.0.0/4 multicast + 240/4 reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true;    // loopback / unspecified
  if (addr.startsWith("fe80")) return true;            // fe80::/10 link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // fc00::/7 unique-local
  if (addr.startsWith("ff")) return true;              // ff00::/8 multicast
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]);         // IPv4-mapped ::ffff:a.b.c.d
  return false;
}

/** True if `ip` is a private, reserved, loopback, or link-local address. */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP → block
}

/**
 * Throws SsrfError unless `rawUrl` is an http(s) URL whose host does not resolve
 * to a private/reserved address. Resolves DNS for hostnames (all A/AAAA records
 * must be public) to defend against records that point inward.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError("Only http and https URLs are allowed");
  }

  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, ""); // strip IPv6 brackets
  if (!host) {
    throw new SsrfError("URL host is missing");
  }

  // Block obviously-internal names outright (also covers hosts that don't resolve
  // via DNS but are meaningful to the local resolver, e.g. container names).
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.localdomain)$/i.test(host)) {
    throw new SsrfError("Host is not permitted");
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new SsrfError("URL resolves to a private or reserved address");
    }
    return parsed;
  }

  const results = await lookup(host, { all: true });
  if (results.length === 0) {
    throw new SsrfError("Host did not resolve");
  }
  for (const { address } of results) {
    if (isBlockedIp(address)) {
      throw new SsrfError("URL resolves to a private or reserved address");
    }
  }
  return parsed;
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxRedirects?: number;
}

/**
 * fetch() wrapper that enforces SSRF protection on the initial URL and on every
 * redirect hop. Redirects are followed manually (redirect: "manual") so each
 * Location is re-validated before the next request. Throws SsrfError when any
 * hop targets a private address or a non-http(s) scheme.
 */
export async function safePublicFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await assertPublicHttpUrl(currentUrl);

    const response = await fetch(validated, {
      redirect: "manual",
      signal: options.signal,
      headers: options.headers,
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");
    if (!isRedirect || !location) {
      return response;
    }

    // Resolve relative redirects against the current URL, then loop to re-validate.
    currentUrl = new URL(location, validated).toString();
  }

  throw new SsrfError("Too many redirects");
}
