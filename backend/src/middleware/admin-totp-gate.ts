import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "./auth.js";
import logger from "../lib/logger.js";

// §2.10 — admin TOTP grace gate.
//
// Mounted at `app.use("/api/admin", adminTotpGate)`. Express strips the
// mount prefix from `req.path` before this runs, so the exemption check
// for the enrolment routes uses the relative path.
//
// Behaviour:
//   - non-admin caller            → 403 (defence in depth; individual routes
//                                   still enforce their own role checks)
//   - admin, enrolled             → next()
//   - admin, not enrolled, grace  → READ-ONLY: GET/HEAD/OPTIONS pass with
//                                   X-Admin-Totp-Grace-Until set (SPA banner);
//                                   mutating methods are 403'd (H2: a stolen
//                                   admin credential must not be able to
//                                   suspend users / change billing during
//                                   grace). Every grace access is warn-logged
//                                   for alerting.
//   - admin, not enrolled, expired → 403 with code TOTP_ENROLMENT_REQUIRED
//
// /totp/* is exempt — admins POST there to enrol.

const isTestBypass = (req: Request): boolean =>
  process.env.NODE_ENV === "test" && req.headers["x-admin-totp-test-bypass"] !== "enforce";

export async function adminTotpGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.path.startsWith("/totp/") || req.path === "/totp") {
    next();
    return;
  }

  if (isTestBypass(req)) {
    next();
    return;
  }

  authenticate(req, res, async () => {
    if (!req.user) return; // authenticate already responded 401

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        role: true,
        totpEnrolledAt: true,
        totpGraceUntil: true,
        adminRole: { select: { id: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const isAdmin = user.role === Role.ADMIN || user.adminRole !== null;
    if (!isAdmin) {
      res.status(403).json({ error: "Admin role required", code: "ADMIN_ROLE_REQUIRED" });
      return;
    }

    if (user.totpEnrolledAt) {
      next();
      return;
    }

    const now = Date.now();
    const graceMs = user.totpGraceUntil?.getTime() ?? 0;

    if (graceMs > now) {
      res.setHeader(
        "X-Admin-Totp-Grace-Until",
        user.totpGraceUntil!.toISOString(),
      );

      const isReadOnly =
        req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";

      logger.warn(
        {
          adminUserId: req.user.userId,
          method: req.method,
          path: req.originalUrl ?? req.path,
          graceUntil: user.totpGraceUntil!.toISOString(),
          allowed: isReadOnly,
        },
        "[admin-totp] grace-period admin access without TOTP enrolment",
      );

      if (!isReadOnly) {
        res.status(403).json({
          error:
            "Mutating admin actions require TOTP enrolment. Read access remains available during your grace period.",
          code: "TOTP_ENROLMENT_REQUIRED",
          enrolEndpoint: "/api/admin/totp/enrol",
          graceUntil: user.totpGraceUntil!.toISOString(),
        });
        return;
      }

      next();
      return;
    }

    res.status(403).json({
      error: "Admin TOTP enrolment required before this action.",
      code: "TOTP_ENROLMENT_REQUIRED",
      enrolEndpoint: "/api/admin/totp/enrol",
    });
  });
}
