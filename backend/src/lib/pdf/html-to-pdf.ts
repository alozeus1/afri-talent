// Server-side HTML → PDF rendering for resume exports (Workstream B).
//
// Uses puppeteer-core against a system chromium (installed in the backend
// Docker image; CHROMIUM_PATH overrides the default /usr/bin/chromium).
//
// SECURITY: the filled template HTML embeds candidate-controlled resume
// content which template-filler does NOT escape. The page is therefore
// rendered with JavaScript disabled and ALL network requests blocked —
// the renderer is a pure layout engine here, nothing in the document can
// execute or exfiltrate. Chromium runs with --no-sandbox because the
// container itself is the isolation boundary (no user namespaces on
// Fargate); with JS disabled the renderer never executes untrusted code.
//
// Availability: when no chromium binary exists (local dev without the
// image), isPdfRendererAvailable() returns false and the route responds
// 503 — same graceful pattern as other optional infrastructure.

import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";
import logger from "../logger.js";

const DEFAULT_CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

const RENDER_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_RENDERS = 2;

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;
let activeRenders = 0;
const waiters: Array<() => void> = [];

export function resolveChromiumPath(): string | null {
  const fromEnv = process.env.CHROMIUM_PATH?.trim();
  if (fromEnv) {
    return existsSync(fromEnv) ? fromEnv : null;
  }
  return DEFAULT_CHROMIUM_PATHS.find((p) => existsSync(p)) ?? null;
}

export function isPdfRendererAvailable(): boolean {
  return resolveChromiumPath() !== null;
}

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  if (launching) {
    return launching;
  }

  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error("No chromium executable available for PDF rendering");
  }

  launching = (async () => {
    const { launch } = await import("puppeteer-core");
    const instance = await launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
      ],
    });
    instance.on("disconnected", () => {
      if (browser === instance) {
        browser = null;
      }
    });
    browser = instance;
    return instance;
  })();

  try {
    return await launching;
  } finally {
    launching = null;
  }
}

async function acquireSlot(): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeRenders += 1;
}

function releaseSlot(): void {
  activeRenders -= 1;
  const next = waiters.shift();
  if (next) next();
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  await acquireSlot();
  try {
    const instance = await getBrowser();
    const page = await instance.newPage();
    try {
      // Untrusted-content hardening: no script execution, no network.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        void request.abort();
      });

      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: RENDER_TIMEOUT_MS,
      });

      const pdf = await page.pdf({
        format: "a4",
        printBackground: true,
        margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
        timeout: RENDER_TIMEOUT_MS,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "[pdf] HTML render failed",
    );
    throw error;
  } finally {
    releaseSlot();
  }
}

// Test/shutdown hook.
export async function closePdfRenderer(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
  }
}
