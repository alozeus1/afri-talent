import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { Role } from "@prisma/client";

vi.mock("../lib/prisma.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../lib/redis.js", () => ({
  isTokenBlocked: vi.fn().mockResolvedValue(false),
}));

import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { signToken } from "../lib/jwt.js";

function requestWithToken(token: string): Request {
  return {
    headers: { authorization: `Bearer ${token}` },
  } as Request;
}

function response(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, status, json };
}

function candidateToken(): string {
  return signToken({
    userId: "candidate-1",
    email: "candidate@example.test",
    role: Role.CANDIDATE,
  });
}

describe("authenticate current-account enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the current database role instead of a stale JWT role claim", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "candidate-1",
      email: "candidate@example.test",
      role: Role.EMPLOYER,
      deletedAt: null,
    });
    const req = requestWithToken(candidateToken());
    const { res } = response();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.role).toBe(Role.EMPLOYER);
  });

  it("rejects a valid token after its account has been deleted", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "candidate-1",
      email: "candidate@example.test",
      role: Role.CANDIDATE,
      deletedAt: new Date(),
    });
    const req = requestWithToken(candidateToken());
    const { res, status, json } = response();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Account is no longer active" });
  });

  it("rejects a valid token after the account is suspended", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "candidate-1",
      email: "candidate@example.test",
      role: Role.CANDIDATE,
      deletedAt: null,
      accountRestrictionStatus: "SUSPENDED",
    });
    const req = requestWithToken(candidateToken());
    const { res, status, json } = response();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Account is no longer active" });
  });
});
