import { Router, Request, Response } from "express";
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { passwordResetLimiter } from "../middleware/security.js";
import { passwordResetEmail } from "../lib/email.js";
import logger from "../lib/logger.js";

const router = Router();

const RESET_TOKEN_EXPIRY_HOURS = 1;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
});

// POST /api/auth/forgot-password
router.post("/forgot-password", passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);

    // Always return success to prevent email enumeration
    const successResponse = {
      message: "If an account with that email exists, a password reset link has been sent.",
    };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      res.json(successResponse);
      return;
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a secure random token
    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    void passwordResetEmail({
      to: user.email,
      userName: user.name,
      resetUrl,
      expiresInHours: RESET_TOKEN_EXPIRY_HOURS,
    }).catch((err) => logger.error({ err }, "Failed to send password reset email"));

    logger.info({ userId: user.id.slice(0, 8) }, "Password reset token generated");
    res.json(successResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Please provide a valid email address" });
      return;
    }
    logger.error({ error }, "Forgot password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
});

// POST /api/auth/reset-password
router.post("/reset-password", passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetToken) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    if (resetToken.usedAt) {
      res.status(400).json({ error: "This reset token has already been used" });
      return;
    }

    if (resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "This reset token has expired. Please request a new one." });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info({ userId: resetToken.userId.slice(0, 8) }, "Password reset successful");
    res.json({ message: "Password has been reset successfully. You can now log in with your new password." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
