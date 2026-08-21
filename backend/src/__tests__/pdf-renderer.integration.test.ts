import { afterEach, describe, expect, it, vi } from "vitest";
import { isPdfRendererAvailable, renderHtmlToPdf, resolveChromiumPath } from "../lib/pdf/html-to-pdf.js";

const originalEnv = { ...process.env };

function configureRenderer(url = "http://pdf-renderer.internal:8080/render"): void {
  process.env.PDF_RENDERER_URL = url;
  process.env.PDF_RENDERER_ALLOWED_HOSTS = "pdf-renderer.internal";
  process.env.PDF_RENDERER_SHARED_SECRET = "r".repeat(32);
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("internal PDF renderer client", () => {
  it("does not expose a local Chromium renderer", () => {
    process.env.CHROMIUM_PATH = "/usr/bin/chromium";
    expect(resolveChromiumPath()).toBeNull();
  });

  it("fails closed until a private allowlisted renderer and strong secret are configured", () => {
    process.env.PDF_RENDERER_URL = "https://public.example.test/render";
    process.env.PDF_RENDERER_ALLOWED_HOSTS = "pdf-renderer.internal";
    process.env.PDF_RENDERER_SHARED_SECRET = "too-short";
    expect(isPdfRendererAvailable()).toBe(false);
  });

  it("authenticates the bounded exact HTML request and accepts only a PDF response", async () => {
    configureRenderer();
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from("%PDF-1.4 test"), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pdf = await renderHtmlToPdf("<main>candidate content</main>");

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://pdf-renderer.internal:8080/render"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-afritalent-pdf-timestamp": expect.stringMatching(/^\d+$/),
          "x-afritalent-pdf-signature": expect.stringMatching(/^v1=[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it("rejects oversized input before any renderer request", async () => {
    configureRenderer();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(renderHtmlToPdf("x".repeat(1_000_001))).rejects.toThrow(/input exceeds/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
