import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { signToken, getTokenExpiresIn } from "../lib/jwt.js";
import { authLimiter } from "../middleware/security.js";
import { OAuthProvider, Role } from "@prisma/client";
import { issueEmailVerification } from "./email-verification.js";

const router = Router();

const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

// ---------- Google OAuth ----------

const googleCallbackSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) throw new Error("Failed to fetch Google user info");
  return userRes.json() as Promise<{
    sub: string;
    email: string;
    name: string;
    picture?: string;
    email_verified: boolean;
  }>;
}

router.post("/google/callback", authLimiter, async (req: Request, res: Response) => {
  try {
    const { code, redirectUri } = googleCallbackSchema.parse(req.body);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const finalRedirect = redirectUri || `${frontendUrl}/auth/callback`;

    const profile = await exchangeGoogleCode(code, finalRedirect);

    return await handleOAuthLogin(res, {
      provider: OAuthProvider.GOOGLE,
      providerUserId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
      emailVerified: profile.email_verified,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    console.error("Google OAuth error:", error);
    res.status(500).json({ error: "OAuth authentication failed" });
  }
});

// ---------- Apple OAuth ----------

const appleCallbackSchema = z.object({
  code: z.string().min(1),
  idToken: z.string().min(1),
  user: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payload);
}

router.post("/apple/callback", authLimiter, async (req: Request, res: Response) => {
  try {
    const { idToken, user } = appleCallbackSchema.parse(req.body);

    const payload = decodeJwtPayload(idToken) as {
      sub: string;
      email?: string;
      email_verified?: string | boolean;
    };

    if (!payload.sub) {
      res.status(400).json({ error: "Invalid Apple ID token" });
      return;
    }

    const email = payload.email || user?.email;
    const name = user?.name || email?.split("@")[0] || "Apple User";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";

    return await handleOAuthLogin(res, {
      provider: OAuthProvider.APPLE,
      providerUserId: payload.sub,
      email: email || undefined,
      name,
      emailVerified,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    console.error("Apple OAuth error:", error);
    res.status(500).json({ error: "OAuth authentication failed" });
  }
});

// ---------- Shared OAuth Logic ----------

interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email?: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

function providerDisplayName(provider: OAuthProvider): string {
  return provider === OAuthProvider.GOOGLE ? "Google" : "Apple";
}

async function handleOAuthLogin(res: Response, profile: OAuthProfile) {
  const { provider, providerUserId, email, name, avatarUrl, emailVerified } = profile;
  const normalizedEmail = email?.toLowerCase();

  // 1. Check if this OAuth account already exists
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });

  if (existingOAuth) {
    // Existing OAuth user — just sign in
    const token = signToken({
      userId: existingOAuth.user.id,
      email: existingOAuth.user.email,
      role: existingOAuth.user.role,
    });
    setAuthCookie(res, token);
    return res.json({
      user: {
        id: existingOAuth.user.id,
        email: existingOAuth.user.email,
        name: existingOAuth.user.name,
        role: existingOAuth.user.role,
        emailVerified: existingOAuth.user.emailVerified,
        avatarUrl: existingOAuth.user.avatarUrl,
      },
      isNewUser: false,
      expiresIn: getTokenExpiresIn(),
    });
  }

  // 2. Check if a user with this email already exists (account linking)
  let user = normalizedEmail
    ? await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })
    : null;

  let isNewUser = false;

  if (user) {
    const hasProviderLinked = await prisma.oAuthAccount.findFirst({
      where: {
        userId: user.id,
        provider,
      },
      select: { id: true },
    });

    if (hasProviderLinked) {
      res.status(409).json({
        error: `This email is already linked to ${providerDisplayName(provider)}. Please continue with that provider.`,
        code: "PROVIDER_MISMATCH",
      });
      return;
    }

    // Prevent unsafe linking when neither side can assert verified ownership.
    if (!user.emailVerified && !emailVerified) {
      res.status(409).json({
        error: "Email ownership is not verified. Verify your email first, then try again.",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    // Link OAuth account to existing user
    await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider,
        providerUserId,
        email: normalizedEmail,
        displayName: name,
        avatarUrl,
      },
    });

    // If OAuth says email is verified and user isn't yet, mark verified
    if (emailVerified && !user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      });
      user = {
        ...user,
        emailVerified: true,
      };
    }

    // Update avatar if user doesn't have one
    if (avatarUrl && !user.avatarUrl) {
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl },
      });
      user = {
        ...user,
        avatarUrl,
      };
    }

    if (!user.emailVerified && process.env.NODE_ENV !== "test") {
      void issueEmailVerification({
        userId: user.id,
        email: user.email,
        name: user.name,
        invalidateExisting: true,
      }).catch((verificationError) => {
        console.error("Failed to send verification email after OAuth link:", verificationError);
      });
    }
  } else {
    // 3. Create new user + OAuth account
    if (!normalizedEmail) {
      res.status(400).json({
        error: "Email is required for registration. Please grant email access.",
        code: "EMAIL_REQUIRED",
      });
      return;
    }

    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: "", // OAuth-only user, no password
        name,
        role: Role.CANDIDATE, // default for OAuth signups
        emailVerified: emailVerified,
        emailVerifiedAt: emailVerified ? new Date() : null,
        avatarUrl,
        oauthAccounts: {
          create: {
            provider,
            providerUserId,
            email: normalizedEmail,
            displayName: name,
            avatarUrl,
          },
        },
      },
    });
    isNewUser = true;

    if (!emailVerified && process.env.NODE_ENV !== "test") {
      void issueEmailVerification({
        userId: user.id,
        email: user.email,
        name: user.name,
        invalidateExisting: true,
      }).catch((verificationError) => {
        console.error("Failed to send verification email after OAuth signup:", verificationError);
      });
    }
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  setAuthCookie(res, token);

  res.status(isNewUser ? 201 : 200).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    },
    isNewUser,
    expiresIn: getTokenExpiresIn(),
  });
}

// ---------- OAuth Config Endpoint ----------

router.get("/providers", (_req: Request, res: Response) => {
  const providers: { provider: string; clientId: string; enabled: boolean }[] = [];

  const googleId = process.env.GOOGLE_CLIENT_ID;
  if (googleId) {
    providers.push({ provider: "google", clientId: googleId, enabled: true });
  }

  const appleId = process.env.APPLE_CLIENT_ID;
  if (appleId) {
    providers.push({ provider: "apple", clientId: appleId, enabled: true });
  }

  res.json({ providers });
});

export default router;
