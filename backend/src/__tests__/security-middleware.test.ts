import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { getAuthenticatedRateLimitKey, sanitizeRequest } from "../middleware/security.js";

describe("sanitizeRequest", () => {
  it("removes control characters from nested strings and arrays", () => {
    const req = {
      body: {
        name: "Jane\u0000 Doe",
        nested: {
          note: "hello\u0007world",
        },
        items: [
          { label: "one\u001Ftwo" },
          "leave-array-primitives-alone",
        ],
      },
      query: {
        search: "devops\u000Brole",
      },
    } as unknown as Request;

    const next = vi.fn() as unknown as NextFunction;

    sanitizeRequest(req, {} as Response, next);

    expect(req.body).toEqual({
      name: "Jane Doe",
      nested: {
        note: "helloworld",
      },
      items: [
        { label: "onetwo" },
        "leave-array-primitives-alone",
      ],
    });
    expect(req.query).toEqual({
      search: "devopsrole",
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("removes prototype pollution keys before they can be consumed downstream", () => {
    const req = {
      body: JSON.parse("{\"safe\":\"value\",\"__proto__\":{\"polluted\":\"yes\"},\"constructor\":{\"prototype\":{\"admin\":true}}}"),
      query: {},
    } as unknown as Request;

    sanitizeRequest(req, {} as Response, vi.fn() as unknown as NextFunction);

    expect(req.body).toEqual({ safe: "value" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe("authenticated AI rate-limit keys", () => {
  it("keys protected AI limits by authenticated user and scope", () => {
    const req = {
      user: { userId: "user-123" },
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;

    expect(getAuthenticatedRateLimitKey(req, "skills")).toBe("skills:user:user-123");
    expect(getAuthenticatedRateLimitKey(req, "trust-reports")).toBe("trust-reports:user:user-123");
  });

  it("does not fall back to per-IP keying when auth has not populated req.user", () => {
    const req = {
      ip: "203.0.113.10",
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;

    expect(getAuthenticatedRateLimitKey(req, "skills")).toBe("skills:unauthenticated");
  });
});
