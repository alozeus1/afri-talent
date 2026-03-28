import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";

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

  // In production, use SES. For now, log the URL.
  if (process.env.NODE_ENV === "production") {
    try {
      const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
      const ses = new SESClient({});
      await ses.send(
        new SendEmailCommand({
          Source: process.env.SES_FROM_EMAIL || "noreply@afritalent.com",
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: "Verify your AfriTalent email" },
            Body: {
              Html: {
                Data: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome to AfriTalent, ${name}!</h2>
                    <p>Please verify your email address by clicking the button below:</p>
                    <a href="${verifyUrl}" style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                      Verify Email
                    </a>
                    <p style="margin-top: 16px; color: #666;">This link expires in ${VERIFICATION_EXPIRY_HOURS} hours.</p>
                    <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
                  </div>
                `,
              },
            },
          },
        })
      );
    } catch (err) {
      console.error("SES send failed:", err);
    }
  } else {
    console.log(`[EMAIL VERIFICATION] ${email} → ${verifyUrl}`);
  }
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

  return { token, expiresAt };
}

// POST /api/auth/email/send-verification — authenticated, sends a new token
router.post("/send-verification", authenticate, resendLimiter, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.emailVerified) {
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
    res.status(500).json({ error: "Failed to send verification email" });
  }
});

// POST /api/auth/email/verify — public, verifies the token
router.post("/verify", verifyLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record) {
      res.status(400).json({ error: "Invalid verification token" });
      return;
    }

    if (record.usedAt) {
      res.status(400).json({ error: "Token has already been used" });
      return;
    }

    if (record.expiresAt < new Date()) {
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

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Verify email error:", error);
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
