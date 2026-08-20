import { describe, expect, it } from "vitest";
import { isSafeExternalHttpsUrl } from "../../lib/security/external-url.js";

describe("external CV URL containment", () => {
  it("accepts only credential-free HTTPS URLs", () => {
    expect(isSafeExternalHttpsUrl("https://cv.example.test/resume.pdf")).toBe(true);
    expect(isSafeExternalHttpsUrl("http://cv.example.test/resume.pdf")).toBe(false);
    expect(isSafeExternalHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalHttpsUrl("https://user:password@cv.example.test/resume.pdf")).toBe(false);
  });

  it("matches allowed domains at label boundaries", () => {
    expect(isSafeExternalHttpsUrl("https://files.example.test/cv.pdf", ["example.test"])).toBe(true);
    expect(isSafeExternalHttpsUrl("https://example.test/cv.pdf", ["example.test"])).toBe(true);
    expect(isSafeExternalHttpsUrl("https://evil-example.test/cv.pdf", ["example.test"])).toBe(false);
  });
});
