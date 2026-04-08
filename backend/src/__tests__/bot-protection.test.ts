import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  blockAnonymousJobsAutomation,
  validateHumanAuthSubmission,
} from "../middleware/bot-protection.js";

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
  it("blocks obvious automation user agents for anonymous job scraping", () => {
    const req = {
      user: undefined,
      header: vi.fn().mockImplementation((name: string) => {
        if (name === "x-afritalent-internal-fetch") return undefined;
        if (name === "user-agent") return "python-requests/2.31.0";
        return undefined;
      }),
    } as unknown as Request;
    const res = createResponse();

    blockAnonymousJobsAutomation(req, res, vi.fn() as unknown as NextFunction);

    expect((res.status as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
  });

  it("allows internal and browser-originated traffic through", () => {
    const req = {
      user: undefined,
      header: vi.fn().mockImplementation((name: string) => {
        if (name === "x-afritalent-internal-fetch") return "server-public-api";
        if (name === "user-agent") return "node";
        return undefined;
      }),
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;

    blockAnonymousJobsAutomation(req, createResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });
});
