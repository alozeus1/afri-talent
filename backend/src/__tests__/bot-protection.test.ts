import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  blockAnonymousJobsAutomation,
  validateHumanAuthSubmission,
} from "../middleware/bot-protection.js";

const INTERNAL_FETCH_SECRET = "test-internal-fetch-secret";

function createResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return res;
}

describe("validateHumanAuthSubmission", () => {
  it("rejects filled honeypot submissions", () => {
    const req = {
      body: {
        botShield: {
          website: "https://spam.example",
          startedAt: Date.now() - 5000,
        },
      },
      header: vi.fn().mockReturnValue("Mozilla/5.0"),
    } as unknown as Request;
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    validateHumanAuthSubmission(req, res, next);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects suspiciously fast submissions", () => {
    const req = {
      body: {
        botShield: {
          website: "",
          startedAt: Date.now() - 100,
        },
      },
      header: vi.fn().mockReturnValue("Mozilla/5.0"),
    } as unknown as Request;
    const res = createResponse();

    validateHumanAuthSubmission(req, res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
  });
});

describe("blockAnonymousJobsAutomation", () => {
  const originalSecret = process.env.INTERNAL_FETCH_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_FETCH_SECRET = INTERNAL_FETCH_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.INTERNAL_FETCH_SECRET;
    } else {
      process.env.INTERNAL_FETCH_SECRET = originalSecret;
    }
  });

  function automationRequest(internalFetchHeader: string | undefined): Request {
    return {
      user: undefined,
      header: vi.fn().mockImplementation((name: string) => {
        if (name === "x-afritalent-internal-fetch") return internalFetchHeader;
        if (name === "user-agent") return "python-requests/2.31.0";
        return undefined;
      }),
    } as unknown as Request;
  }

  it("blocks obvious automation user agents for anonymous job scraping", () => {
    const res = createResponse();

    blockAnonymousJobsAutomation(automationRequest(undefined), res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
  });

  it("allows internal traffic carrying the correct shared secret", () => {
    const req = {
      user: undefined,
      header: vi.fn().mockImplementation((name: string) => {
        if (name === "x-afritalent-internal-fetch") return INTERNAL_FETCH_SECRET;
        if (name === "user-agent") return "node";
        return undefined;
      }),
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    blockAnonymousJobsAutomation(req, createResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks the legacy spoofable marker value", () => {
    const res = createResponse();

    blockAnonymousJobsAutomation(automationRequest("server-public-api"), res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
  });

  it("blocks a wrong secret value", () => {
    const res = createResponse();

    blockAnonymousJobsAutomation(automationRequest("wrong-secret"), res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
  });

  it("disables the bypass entirely when no secret is configured (fail closed)", () => {
    delete process.env.INTERNAL_FETCH_SECRET;
    const res = createResponse();

    blockAnonymousJobsAutomation(automationRequest("anything"), res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
  });
});
