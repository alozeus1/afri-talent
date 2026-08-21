import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { launch } from "puppeteer-core";

const PORT = Number(process.env.PORT ?? "8080");
const SECRET = process.env.PDF_RENDERER_SHARED_SECRET ?? "";
const MAX_INPUT_BYTES = Number(process.env.PDF_RENDERER_MAX_INPUT_BYTES ?? "1000000");
const MAX_OUTPUT_BYTES = Number(process.env.PDF_RENDERER_MAX_OUTPUT_BYTES ?? "10000000");
const MAX_CONCURRENCY = Number(process.env.PDF_RENDERER_MAX_CONCURRENCY ?? "2");
const TIMEOUT_MS = Number(process.env.PDF_RENDERER_TIMEOUT_MS ?? "30000");
const TOLERANCE_SECONDS = 300;

if (SECRET.length < 32) throw new Error("PDF_RENDERER_SHARED_SECRET must be at least 32 characters");
if (!Number.isInteger(PORT) || !Number.isInteger(MAX_INPUT_BYTES) || !Number.isInteger(MAX_OUTPUT_BYTES) || !Number.isInteger(MAX_CONCURRENCY) || !Number.isInteger(TIMEOUT_MS)) {
  throw new Error("PDF renderer limits must be integers");
}

let active = 0;
let browser;

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

function digest(timestamp, body) {
  return createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

function validSignature(header, timestamp, body) {
  const match = /^v1=([a-f0-9]{64})$/.exec(header ?? "");
  if (!match) return false;
  const expected = Buffer.from(digest(timestamp, body), "hex");
  const received = Buffer.from(match[1], "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function chromium() {
  if (browser?.connected) return browser;
  browser = await launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    // The task's Linux security options, readonly root, private network and
    // capability drop are the boundary. No renderer URL or browser argument
    // is request-controlled.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--no-first-run", "--no-zygote", "--disable-extensions"],
  });
  return browser;
}

async function render(html) {
  const instance = await chromium();
  const page = await instance.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) => { void request.abort(); });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    const pdf = Buffer.from(await page.pdf({ format: "a4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }, timeout: TIMEOUT_MS }));
    if (pdf.length === 0 || pdf.length > MAX_OUTPUT_BYTES) throw new Error("renderer output exceeds bounds");
    return pdf;
  } finally {
    await page.close().catch(() => undefined);
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") return send(response, 200, "{\"status\":\"ok\"}");
  if (request.method !== "POST" || request.url !== "/render") return send(response, 404, "{\"error\":\"not found\"}");
  if (active >= MAX_CONCURRENCY) return send(response, 429, "{\"error\":\"busy\"}");

  const timestamp = request.headers["x-afritalent-pdf-timestamp"];
  const signature = request.headers["x-afritalent-pdf-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string" || !/^\d{10,11}$/.test(timestamp)) {
    return send(response, 401, "{\"error\":\"unauthorized\"}");
  }
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > TOLERANCE_SECONDS) {
    return send(response, 401, "{\"error\":\"unauthorized\"}");
  }

  const chunks = [];
  let bytes = 0;
  let failed = false;
  request.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) {
      failed = true;
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("error", () => { if (!response.writableEnded) send(response, 400, "{\"error\":\"invalid request\"}"); });
  request.on("end", async () => {
    if (failed) return send(response, 413, "{\"error\":\"payload too large\"}");
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!validSignature(signature, timestamp, raw)) return send(response, 401, "{\"error\":\"unauthorized\"}");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return send(response, 400, "{\"error\":\"invalid JSON\"}"); }
    if (!parsed || typeof parsed.html !== "string" || Object.keys(parsed).length !== 1) return send(response, 400, "{\"error\":\"invalid payload\"}");
    active += 1;
    try {
      const pdf = await render(parsed.html);
      send(response, 200, pdf, "application/pdf");
    } catch {
      // Do not log HTML, signatures, or document content.
      send(response, 503, "{\"error\":\"renderer unavailable\"}");
    } finally {
      active -= 1;
    }
  });
});

server.requestTimeout = TIMEOUT_MS + 5_000;
server.headersTimeout = 10_000;
server.listen(PORT, "0.0.0.0");
