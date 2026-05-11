import { Router, Request, Response } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import {
  generateTotpSecret,
  verifyTotpCode,
  buildProvisioningUri,
  encryptTotpSecret,
  decryptTotpSecret,
} from "../lib/totp.js";
import logger from "../lib/logger.js";

// §2.10 — admin TOTP MFA enrolment endpoints.
//
// Flow:
//   1. GET  /api/admin/totp/status         → returns enrolled state + grace
//   2. POST /api/admin/totp/enrol          → generates and stores secret,
//                                            returns otpauth:// URI + secret
//                                            (admin must complete step 3)
//   3. POST /api/admin/totp/verify-enrolment {code} → marks enrolment
//      complete on the first valid code; this is the cutover from
//      "secret-in-progress" to "MFA active"
//   4. POST /api/admin/totp/disable        → admin only, requires current
//      code; clears the secret (e.g. lost device → support flow)
//
// Frontend banner + email nudge are a follow-up. The status endpoint gives
// the frontend everything it needs to render its own prompt.

const router = Router();

async function loadActor(userId: string): Promise<{
  id: string;
  email: string;
  role: Role;
  totpSecretEncrypted: string | null;
  totpEnrolledAt: Date | null;
  totpGraceUntil: Date | null;
  adminRoleId: string | null;
} | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { adminRole: { select: { id: true } } },
  });
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    totpSecretEncrypted: u.totpSecretEncrypted,
    totpEnrolledAt: u.totpEnrolledAt,
    totpGraceUntil: u.totpGraceUntil,
    adminRoleId: u.adminRole?.id ?? null,
  };
}

function isAdminish(u: { role: Role; adminRoleId: string | null }): boolean {
  return u.role === Role.ADMIN || u.adminRoleId !== null;
}

router.get("/status", authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const actor = await loadActor(userId);
  if (!actor) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!isAdminish(actor)) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  res.json({
    enrolled: actor.totpEnrolledAt !== null,
    enrolmentStartedAt: actor.totpSecretEncrypted !== null ? "pending" : null,
    graceUntil: actor.totpGraceUntil,
    isAdmin: true,
  });
});

router.post("/enrol", authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const actor = await loadActor(userId);
  if (!actor) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!isAdminish(actor)) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  if (actor.totpEnrolledAt) {
    res.status(409).json({
      error: "TOTP already enrolled — disable first to re-enrol",
      code: "TOTP_ALREADY_ENROLLED",
    });
    return;
  }

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  await prisma.user.update({
    where: { id: actor.id },
    data: { totpSecretEncrypted: encrypted },
  });

  res.json({
    secret,
    provisioningUri: buildProvisioningUri({ email: actor.email, secret }),
    instructions:
      "Scan the QR (or enter the secret manually) in your authenticator, then POST the 6-digit code to /api/admin/totp/verify-enrolment to activate MFA.",
  });
});

const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

router.post("/verify-enrolment", authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "code must be a 6-digit string", code: "TOTP_BAD_FORMAT" });
    return;
  }

  const userId = req.user!.userId;
  const actor = await loadActor(userId);
  if (!actor) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!isAdminish(actor)) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  if (!actor.totpSecretEncrypted) {
    res.status(409).json({ error: "No enrolment in progress", code: "TOTP_NOT_STARTED" });
    return;
  }
  if (actor.totpEnrolledAt) {
    res.status(409).json({ error: "Already enrolled", code: "TOTP_ALREADY_ENROLLED" });
    return;
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(actor.totpSecretEncrypted);
  } catch (err) {
    logger.error({ err, userId }, "[totp] failed to decrypt stored secret");
    res.status(500).json({ error: "TOTP secret could not be read", code: "TOTP_DECRYPT_FAILED" });
    return;
  }

  if (!verifyTotpCode(secret, parsed.data.code)) {
    res.status(400).json({ error: "Invalid code — try the latest one", code: "TOTP_INVALID_CODE" });
    return;
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: { totpEnrolledAt: new Date() },
  });

  res.json({ enrolled: true, enrolledAt: new Date().toISOString() });
});

router.post("/disable", authenticate, async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "code must be a 6-digit string", code: "TOTP_BAD_FORMAT" });
    return;
  }

  const userId = req.user!.userId;
  const actor = await loadActor(userId);
  if (!actor) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!isAdminish(actor)) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  if (!actor.totpEnrolledAt || !actor.totpSecretEncrypted) {
    res.status(409).json({ error: "TOTP not enrolled", code: "TOTP_NOT_ENROLLED" });
    return;
  }

  const secret = decryptTotpSecret(actor.totpSecretEncrypted);
  if (!verifyTotpCode(secret, parsed.data.code)) {
    res.status(400).json({ error: "Invalid code", code: "TOTP_INVALID_CODE" });
    return;
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      totpSecretEncrypted: null,
      totpEnrolledAt: null,
      // Disabling restarts the grace window so the admin has time to re-enrol.
      totpGraceUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.json({ disabled: true });
});

export default router;
