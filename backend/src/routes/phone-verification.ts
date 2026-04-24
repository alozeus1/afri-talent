import { Router, Request, Response } from "express";
import { randomInt, createHash } from "crypto";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import {
  phoneOtpRequestLimiter,
  phoneOtpVerifyLimiter,
} from "../middleware/security.js";
import { dispatch as dispatchNotification } from "../lib/notifications/dispatcher.js";
import logger from "../lib/logger.js";

const router = Router();

const OTP_EXPIRY_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;

// E.164: + followed by 8–15 digits.
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const requestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "phoneNumber must be in E.164 format (e.g. +2348012345678)"),
});

const verifyOtpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, "otp must be a 6-digit code"),
});

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// POST /api/auth/phone/request-otp  (authenticated)
router.post(
  "/request-otp",
  authenticate,
  phoneOtpRequestLimiter,
  async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = requestOtpSchema.parse(req.body);
      const userId = req.user!.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, phoneVerifiedAt: true, phoneNumber: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (user.phoneVerifiedAt && user.phoneNumber === phoneNumber) {
        res.status(409).json({
          error: "phone_already_verified",
          message: "This phone number is already verified for your account.",
        });
        return;
      }

      // Expire any pending OTPs for this user/phone before issuing a new one.
      await prisma.userPhoneOtp.updateMany({
        where: { userId, phoneNumber, status: "PENDING" },
        data: { status: "EXPIRED" },
      });

      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await prisma.userPhoneOtp.create({
        data: {
          userId,
          phoneNumber,
          otpHash,
          expiresAt,
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
        },
      });

      void dispatchNotification({
        kind: "PHONE_OTP_REQUESTED",
        user: { id: userId, name: user.name },
        phoneNumber,
        otpCode: otp,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      }).catch((err) =>
        logger.error({ err }, "[phone-verification] dispatch PHONE_OTP_REQUESTED failed"),
      );

      logger.info(
        { userId: userId.slice(0, 8) },
        "[phone-verification] OTP issued",
      );

      res.json({
        message: "Verification code sent. It will expire in 10 minutes.",
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_failed", details: error.issues });
        return;
      }
      logger.error({ error }, "[phone-verification] request-otp failed");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/auth/phone/verify  (authenticated)
router.post(
  "/verify",
  authenticate,
  phoneOtpVerifyLimiter,
  async (req: Request, res: Response) => {
    try {
      const { otp } = verifyOtpSchema.parse(req.body);
      const userId = req.user!.userId;

      const otpHash = hashOtp(otp);
      const candidate = await prisma.userPhoneOtp.findFirst({
        where: { userId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });

      if (!candidate) {
        res.status(400).json({ error: "no_active_otp", message: "Request a new verification code." });
        return;
      }

      if (candidate.expiresAt < new Date()) {
        await prisma.userPhoneOtp.update({
          where: { id: candidate.id },
          data: { status: "EXPIRED" },
        });
        res.status(400).json({ error: "otp_expired", message: "Code expired. Request a new one." });
        return;
      }

      if (candidate.attempts >= MAX_VERIFY_ATTEMPTS) {
        await prisma.userPhoneOtp.update({
          where: { id: candidate.id },
          data: { status: "EXPIRED" },
        });
        res.status(429).json({
          error: "too_many_attempts",
          message: "Maximum verification attempts reached. Request a new code.",
        });
        return;
      }

      if (candidate.otpHash !== otpHash) {
        await prisma.userPhoneOtp.update({
          where: { id: candidate.id },
          data: { attempts: { increment: 1 } },
        });
        res.status(400).json({
          error: "invalid_otp",
          message: "Incorrect verification code.",
          attemptsRemaining: Math.max(0, MAX_VERIFY_ATTEMPTS - candidate.attempts - 1),
        });
        return;
      }

      const verifiedAt = new Date();

      const [, updatedUser] = await prisma.$transaction([
        prisma.userPhoneOtp.update({
          where: { id: candidate.id },
          data: {
            status: "VERIFIED",
            consumedAt: verifiedAt,
            attempts: { increment: 1 },
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            phoneNumber: candidate.phoneNumber,
            phoneVerifiedAt: verifiedAt,
          },
          select: { id: true, email: true, name: true },
        }),
      ]);

      void dispatchNotification({
        kind: "PHONE_VERIFIED",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
        },
        phoneNumber: candidate.phoneNumber,
      }).catch((err) =>
        logger.error({ err }, "[phone-verification] dispatch PHONE_VERIFIED failed"),
      );

      logger.info(
        { userId: userId.slice(0, 8) },
        "[phone-verification] phone verified",
      );

      res.json({
        message: "Phone number verified.",
        verifiedAt: verifiedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "validation_failed", details: error.issues });
        return;
      }
      logger.error({ error }, "[phone-verification] verify failed");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
