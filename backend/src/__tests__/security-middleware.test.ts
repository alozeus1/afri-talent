import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { sanitizeRequest } from "../middleware/security.js";

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
