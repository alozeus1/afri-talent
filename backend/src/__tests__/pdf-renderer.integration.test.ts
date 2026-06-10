import { describe, it, expect, afterAll, afterEach } from "vitest";
import {
    renderHtmlToPdf,
    isPdfRendererAvailable,
    resolveChromiumPath,
    closePdfRenderer,
} from "../lib/pdf/html-to-pdf.js";

const chromiumAvailable = isPdfRendererAvailable();

describe("resolveChromiumPath", () => {
    const original = process.env.CHROMIUM_PATH;

    afterEach(() => {
        if (original === undefined) delete process.env.CHROMIUM_PATH;
        else process.env.CHROMIUM_PATH = original;
    });

    it("returns null when CHROMIUM_PATH points at a missing binary", () => {
        process.env.CHROMIUM_PATH = "/nonexistent/chromium";
        expect(resolveChromiumPath()).toBeNull();
    });
});

// Real-render verification — runs wherever a chromium binary exists (the
// backend Docker image sets CHROMIUM_PATH=/usr/bin/chromium); skipped on
// machines without one.
describe.skipIf(!chromiumAvailable)("renderHtmlToPdf (integration)", () => {
    afterAll(async () => {
        await closePdfRenderer();
    });

    it("produces a parseable PDF containing the document text", async () => {
        const pdf = await renderHtmlToPdf(`
            <html><body>
                <h1>Ada Obi</h1>
                <p>Senior TypeScript Engineer — Lagos</p>
            </body></html>
        `);

        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        expect(pdf.length).toBeGreaterThan(1000);

        const { default: pdfParse } = await import("pdf-parse");
        const parsed = await pdfParse(pdf);
        expect(parsed.text).toContain("Ada Obi");
        expect(parsed.text).toContain("Senior TypeScript Engineer");
    }, 60_000);
});
