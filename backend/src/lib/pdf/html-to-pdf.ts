// Internal PDF renderer client.
//
// PDF rendering is intentionally outside the application process. The backend
// sends only generated HTML to a configured private renderer and authenticates
// the exact request body with a short-lived HMAC. Candidate input never selects
// a renderer URL and the renderer never receives a URL to fetch.

import { createHmac, timingSafeEqual } from "node:crypto";
import logger from "../logger.js";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 1_000_000;
const MAX_PDF_BYTES = 10_000_000;
const TIMESTAMP_TOLERANCE_SECONDS = 300;

type RendererConfig = {
  endpoint: URL;
  secret: string;
};

function allowedRendererHosts(): Set<string> {
  return new Set(
    (process.env.PDF_RENDERER_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getRendererConfig(): RendererConfig | null {
  const rawUrl = process.env.PDF_RENDERER_URL?.trim();
  const secret = process.env.PDF_RENDERER_SHARED_SECRET?.trim();
  if (!rawUrl || !secret || secret.length < 32) return null;

  try {
    const endpoint = new URL(rawUrl);
    const allowedHosts = allowedRendererHosts();
    if (
      (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== "/render" ||
      endpoint.search ||
      endpoint.hash ||
      !allowedHosts.has(endpoint.hostname.toLowerCase())
    ) {
      return null;
    }
    return { endpoint, secret };
  } catch {
    return null;
  }
}

function signature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function isPdfResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return contentType === "application/pdf";
}

export function resolveChromiumPath(): string | null {
  // Kept as a compatibility export for callers/tests: Chromium is never used
  // by the backend runtime after renderer isolation.
  return null;
}

export function isPdfRendererAvailable(): boolean {
  return getRendererConfig() !== null;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const config = getRendererConfig();
  if (!config) throw new Error("PDF renderer is not configured safely");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("PDF renderer input exceeds the configured limit");
  }

  const body = JSON.stringify({ html });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-afritalent-pdf-timestamp": timestamp,
        "x-afritalent-pdf-signature": `v1=${signature(config.secret, timestamp, body)}`,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok || !isPdfResponse(response)) {
      throw new Error(`PDF renderer rejected request (${response.status})`);
    }

    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("PDF renderer returned an invalid document");
    }
    return pdf;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : "renderer request failed" },
      "[pdf] internal renderer request failed",
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function closePdfRenderer(): Promise<void> {
  // Renderer is remote; no local browser lifecycle exists.
}

// Exported for tests only; no request handler accepts caller-provided hosts.
export const pdfRendererSecurityLimits = {
  REQUEST_TIMEOUT_MS,
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  TIMESTAMP_TOLERANCE_SECONDS,
  timingSafeEqual,
};
