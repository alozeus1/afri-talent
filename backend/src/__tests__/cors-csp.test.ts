/**
 * §2.7 + §2.8 — CORS regex validation and CSP report endpoint.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

// vi.mock() is hoisted to the top of the file, so the mock factory cannot
// reference module-level consts. Use vi.hoisted() to lift the mock fn alongside.
const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("../lib/sentry.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/sentry.js")>("../lib/sentry.js");
  return {
    ...actual,
    captureMessage: captureMessageMock,
  };
});

import request from "supertest";
import app from "../app.js";
import { validateAllowedOriginRegex } from "../lib/cors-validation.js";

describe("ALLOWED_ORIGIN_REGEX validator (§2.7)", () => {
  it("accepts an anchored host-bound pattern", () => {
    const rx = validateAllowedOriginRegex("^https://([a-z0-9-]+\\.)?afritalent\\.com$");
    expect(rx).toBeInstanceOf(RegExp);
    expect(rx.test("https://app.afritalent.com")).toBe(true);
    expect(rx.test("https://evil.example.com")).toBe(false);
  });

  it("rejects the canonical match-everything shortcuts", () => {
    for (const pattern of [".*", ".+", "^.*$", "^.+$", "^.*?$", "^.+?$"]) {
      expect(() => validateAllowedOriginRegex(pattern)).toThrowError(/too permissive/);
    }
  });

  it("rejects patterns that match the empty string", () => {
    // `a?` makes `a` optional → matches "" → rejected by the empty-string check.
    expect(() => validateAllowedOriginRegex("a?")).toThrowError(/empty string/);
    // `^$` is the explicit empty-string anchor.
    expect(() => validateAllowedOriginRegex("^$")).toThrowError(/empty string/);
  });

  it("rejects syntactically invalid regular expressions", () => {
    expect(() => validateAllowedOriginRegex("[")).toThrowError(/not a valid regular expression/);
  });
});

describe("CSP report endpoint (§2.8)", () => {
  it("POST /api/csp-report accepts application/csp-report and returns 204", async () => {
    captureMessageMock.mockClear();
    const report = {
      "csp-report": {
        "document-uri": "https://afritalent.com/jobs",
        "violated-directive": "style-src",
        "blocked-uri": "inline",
        "original-policy": "default-src 'self'",
      },
    };
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(report));
    expect(res.status).toBe(204);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][0]).toContain("style-src");
    expect(captureMessageMock.mock.calls[0][1]).toBe("warning");
  });

  it("POST /api/csp-report also accepts application/json bodies", async () => {
    captureMessageMock.mockClear();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/json")
      .send({ "csp-report": { "violated-directive": "script-src" } });
    expect(res.status).toBe(204);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][0]).toContain("script-src");
  });

  it("POST /api/csp-report tolerates a flat body (no 'csp-report' wrapper)", async () => {
    captureMessageMock.mockClear();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/json")
      .send({ "violated-directive": "img-src" });
    expect(res.status).toBe(204);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][0]).toContain("img-src");
  });

  it("POST /api/csp-report is exempt from CSRF (no x-csrf-token header required)", async () => {
    captureMessageMock.mockClear();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/json")
      .set("x-csrf-test-bypass", "enforce")
      .send({ "csp-report": { "violated-directive": "frame-src" } });
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});
