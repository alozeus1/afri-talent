import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { accountEmailVerificationEmail } from "../lib/email.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { dispatch as dispatchNotification } from "../lib/notifications/dispatcher.js";
import logger from "../lib/logger.js";

const router = Router();

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRY_HOURS = 24;

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 3,
  message: { error: "Too many verification emails requested. Please try again later." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 30,
  message: { error: "Too many verification attempts. Please try again later." },
});

async function sendVerificationEmail(email: string, token: string, name: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
  await accountEmailVerificationEmail({
    to: email,
    candidateName: name,
    verifyUrl,
    expiresInHours: VERIFICATION_EXPIRY_HOURS,
  });
}

export async function issueEmailVerification(opts: {
  userId: string;
  email: string;
  name: string;
  invalidateExisting?: boolean;
}): Promise<{ token: string; expiresAt: Date }> {
  if (opts.invalidateExisting !== false) {
    await prisma.emailVerificationToken.updateMany({
      where: { userId: opts.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  const token = nanoid(VERIFICATION_TOKEN_BYTES);
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { userId: opts.userId, token, expiresAt },
  });

  await sendVerificationEmail(opts.email, token, opts.name);
  recordOpsEvent({
    metricName: "verification_email_sent",
    category: "verification",
    details: {
      mode: process.env.NODE_ENV === "production" ? "ses" : "local",
    },
  });

  return { token, expiresAt };
}

// POST /api/auth/email/send-verification — authenticated, sends a new token
router.post("/send-verification", authenticate, resendLimiter, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      recordOpsEvent({
        metricName: "verification_email_failure",
        category: "verification",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "user_not_found",
        },
      });
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.emailVerified) {
      recordOpsEvent({
        metricName: "verification_email_sent",
        category: "verification",
        durationMs: Date.now() - startedAt,
        details: {
          already_verified: true,
        },
      });
      res.json({ message: "Email already verified" });
      return;
    }

    await issueEmailVerification({
      userId: user.id,
      email: user.email,
      name: user.name,
      invalidateExisting: true,
    });

    res.json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Send verification error:", error);
    recordOpsEvent({
      metricName: "verification_email_failure",
      category: "verification",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
    });
    res.status(500).json({ error: "Failed to send verification email" });
  }
});

// POST /api/auth/email/verify — public, verifies the token
router.post("/verify", verifyLimiter, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      recordOpsEvent({
        metricName: "verification_verify_failure",
        category: "verification",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "missing_token",
        },
      });
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record) {
      recordOpsEvent({
        metricName: "verification_verify_failure",
        category: "verification",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "invalid_token",
        },
      });
      res.status(400).json({ error: "Invalid verification token" });
      return;
    }

    if (record.usedAt) {
      recordOpsEvent({
        metricName: "verification_verify_failure",
        category: "verification",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "token_used",
        },
      });
      res.status(400).json({ error: "Token has already been used" });
      return;
    }

    if (record.expiresAt < new Date()) {
      recordOpsEvent({
        metricName: "verification_verify_failure",
        category: "verification",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "token_expired",
        },
      });
      res.status(400).json({ error: "Token has expired. Please request a new one." });
      return;
    }

    await prisma.$transaction([
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
    ]);

    recordOpsEvent({
      metricName: "verification_verify_success",
      category: "verification",
      durationMs: Date.now() - startedAt,
    });

    // Phase 3: notify the user that their email is verified.
    if (record.user) {
      const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com";
      void dispatchNotification({
        kind: "EMAIL_VERIFIED",
        user: { id: record.user.id, email: record.user.email, name: record.user.name },
        appUrl,
      }).catch((err) => logger.error({ err }, "Failed to dispatch email verified notification"));
    }

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Verify email error:", error);
    recordOpsEvent({
      metricName: "verification_verify_failure",
      category: "verification",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
    });
    res.status(500).json({ error: "Verification failed" });
  }
});

// GET /api/auth/email/status — authenticated, check verification status
router.get("/status", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { emailVerified: true, emailVerifiedAt: true, email: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      email: user.email,
      verified: user.emailVerified,
      verifiedAt: user.emailVerifiedAt,
    });
  } catch (error) {
    console.error("Email status error:", error);
    res.status(500).json({ error: "Failed to get verification status" });
  }
});

export { sendVerificationEmail };
export default router;
