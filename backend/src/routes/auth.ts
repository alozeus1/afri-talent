import { Router, Request, Response } from "express";
import { hashPassword, comparePassword, isHashBelowCurrentCost } from "../lib/password.js";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { signToken, getTokenExpiresIn } from "../lib/jwt.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { authLimiter, registerLimiter } from "../middleware/security.js";
import { issueCsrfToken } from "../middleware/csrf.js";
import { validateHumanAuthSubmission } from "../middleware/bot-protection.js";
import { blockToken } from "../lib/redis.js";
import { Role } from "@prisma/client";
import { issueEmailVerification } from "./email-verification.js";
import {
  ensureCandidateTrustProfile,
  ensureEmployerTrustProfile,
  refreshEmployerTrustProfile,
} from "../lib/trust/service.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { dispatch as dispatchNotification } from "../lib/notifications/dispatcher.js";
import logger from "../lib/logger.js";

const router = Router();

const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    // "none" allows the cookie to be sent on cross-origin fetch() calls when
    // the frontend and backend are on different domains (e.g. separate App Runner services).
    // "strict" is used locally where both run on localhost.
    sameSite: isProduction ? "none" : "strict",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

function clearAuthCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "strict",
    path: "/",
  });
}

// Validation schemas with improved security rules
const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  name: z.string().min(2).max(100).trim(),
  role: z.enum(["CANDIDATE", "EMPLOYER"]),
  companyName: z.string().max(200).trim().optional(),
  location: z.string().max(200).trim().optional(),
  botShield: z.object({
    website: z.string().max(200).optional(),
    startedAt: z.number().int().positive().optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().max(128),
  botShield: z.object({
    website: z.string().max(200).optional(),
    startedAt: z.number().int().positive().optional(),
  }).optional(),
});

// POST /api/auth/register - with strict rate limiting
router.post("/register", registerLimiter, validateHumanAuthSubmission, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const data = registerSchema.parse(req.body);

    if (data.role === "EMPLOYER" && (!data.companyName || !data.location)) {
      recordOpsEvent({
        metricName: "signup_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          role: data.role,
          reason: "missing_employer_fields",
        },
      });
      res.status(400).json({ error: "Employer registration requires companyName and location" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        oauthAccounts: {
          select: { provider: true },
        },
      },
    });

    if (existingUser) {
      const providerNames = (existingUser.oauthAccounts || []).map((acc) => acc.provider);
      if (existingUser.password === "" && providerNames.length > 0) {
        recordOpsEvent({
          metricName: "signup_failure",
          category: "auth",
          outcome: "failure",
          severity: "warning",
          durationMs: Date.now() - startedAt,
          details: {
            role: data.role,
            reason: "provider_mismatch",
          },
        });
        res.status(409).json({
          error: `This email is already registered via ${providerNames.join(", ")}. Please continue with social sign in.`,
          code: "PROVIDER_MISMATCH",
          providers: providerNames,
        });
        return;
      }
      recordOpsEvent({
        metricName: "signup_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          role: data.role,
          reason: "email_exists",
        },
      });
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    // §2.10 — bcrypt cost 12 (was 10). hashPassword centralises the cost
    // factor so future bumps live in one file.
    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role as Role,
      },
    });

    // If employer, create employer profile
    if (data.role === "EMPLOYER") {
      const employer = await prisma.employer.create({
        data: {
          userId: user.id,
          companyName: data.companyName!,
          location: data.location || "Remote",
        },
      });

      await ensureEmployerTrustProfile(employer.id);
      await refreshEmployerTrustProfile(employer.id).catch(() => undefined);
    } else {
      await ensureCandidateTrustProfile(user.id);
    }

    if (process.env.NODE_ENV !== "test") {
      void issueEmailVerification({
        userId: user.id,
        email: user.email,
        name: user.name,
        invalidateExisting: true,
      }).catch((verificationError) => {
        console.error("Failed to send verification email:", verificationError);
        recordOpsEvent({
          metricName: "verification_email_failure",
          category: "verification",
          outcome: "failure",
          severity: "warning",
          details: {
            source: "register",
          },
        });
      });

      // Welcome email + in-app notification (best-effort, non-blocking).
      const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com";
      void dispatchNotification({
        kind: "ACCOUNT_REGISTERED",
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        appUrl,
      }).catch((welcomeError) => {
        logger.warn(
          { userId: user.id.slice(0, 8), error: welcomeError instanceof Error ? welcomeError.message : "unknown" },
          "[auth.register] welcome dispatch failed",
        );
      });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    setAuthCookie(res, token);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      expiresIn: getTokenExpiresIn(),
    });
    recordOpsEvent({
      metricName: "signup_success",
      category: "auth",
      durationMs: Date.now() - startedAt,
      details: {
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "signup_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Register error:", error);
    recordOpsEvent({
      metricName: "signup_failure",
      category: "auth",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
      },
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login - with rate limiting
router.post("/login", authLimiter, validateHumanAuthSubmission, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        employer: true,
        adminRole: {
          select: { id: true },
        },
        oauthAccounts: {
          select: { provider: true },
        },
      },
    });

    if (!user) {
      recordOpsEvent({
        metricName: "login_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "user_not_found",
        },
      });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.password && (user.oauthAccounts?.length ?? 0) > 0) {
      const providers = (user.oauthAccounts || []).map((acc) => acc.provider);
      res.status(409).json({
        error: "This account uses social sign-in. Please continue with your OAuth provider.",
        code: "PROVIDER_MISMATCH",
        providers,
      });
      recordOpsEvent({
        metricName: "login_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "provider_mismatch",
        },
      });
      return;
    }

    const validPassword = await comparePassword(data.password, user.password || "");
    // §2.10 transparent rehash — if the stored hash is below the current cost
    // factor, upgrade it now. Best-effort; failures don't block the login.
    if (validPassword && user.password && isHashBelowCurrentCost(user.password)) {
      try {
        const rehashed = await hashPassword(data.password);
        await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
      } catch (rehashError) {
        logger.warn(
          { err: rehashError, userId: user.id },
          "[auth] bcrypt rehash on login failed (non-fatal)",
        );
      }
    }

    if (!validPassword) {
      recordOpsEvent({
        metricName: "login_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "invalid_password",
        },
      });
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // §2.10 — admins created after the migration do not get the SQL backfill.
    // Start their enrolment grace window on first successful password login.
    if (
      (user.role === Role.ADMIN || user.adminRole != null)
      && !user.totpEnrolledAt
      && !user.totpGraceUntil
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpGraceUntil: new Date(Date.now() + COOKIE_MAX_AGE_MS) },
      });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    setAuthCookie(res, token);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        employer: user.employer,
      },
      expiresIn: getTokenExpiresIn(),
    });
    recordOpsEvent({
      metricName: "login_success",
      category: "auth",
      durationMs: Date.now() - startedAt,
      details: {
        role: user.role,
        email_verified: user.emailVerified,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "login_failure",
        category: "auth",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Login error:", error);
    recordOpsEvent({
      metricName: "login_failure",
      category: "auth",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
      },
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout - revoke token and clear cookie
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.rawToken;
    const exp = req.user?.exp;

    if (token && exp) {
      const ttlSeconds = exp - Math.floor(Date.now() / 1000);
      if (ttlSeconds > 0) {
        await blockToken(token, ttlSeconds);
      }
    }

    clearAuthCookie(res);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/me", optionalAuth, async (req: Request, res: Response) => {
  try {
    // §2.3 — issue (or refresh) a CSRF token on every /me call. SPAs hit /me
    // on app load and after login, so this is the canonical place to seed the
    // cookie that subsequent mutating requests will echo as X-CSRF-Token.
    const csrfToken = issueCsrfToken(req, res);

    if (!req.user) {
      res.json({
        authenticated: false,
        user: null,
        csrfToken,
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { employer: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        employer: user.employer,
      },
      csrfToken,
    });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
