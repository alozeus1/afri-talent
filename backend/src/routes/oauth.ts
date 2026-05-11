import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { signToken, getTokenExpiresIn } from "../lib/jwt.js";
import { authLimiter } from "../middleware/security.js";
import { OAuthProvider, Role } from "@prisma/client";
import { issueEmailVerification } from "./email-verification.js";
import {
  generateOAuthState,
  verifyOAuthState,
  buildOAuthStateCookie,
  buildClearOAuthStateCookie,
  readOAuthStateCookie,
} from "../lib/oauth-state.js";

const router = Router();

const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    // "none" required for cross-domain cookie sharing between separate App Runner services.
    sameSite: isProduction ? "none" : "strict",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

// ---------- Google OAuth ----------

// §2.2 — server issues state + PKCE. Frontend never holds the state secret.
router.get("/google/start", authLimiter, (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({
      error: "Google sign-in is not configured for this environment.",
      code: "OAUTH_MISSING_CONFIG",
    });
    return;
  }
  const { state, codeChallenge, cookieValue } = generateOAuthState("google");
  res.setHeader("Set-Cookie", buildOAuthStateCookie(cookieValue));
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${frontendUrl}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
    code_challenge: codeChallenge!,
    code_challenge_method: "S256",
  });
  res.json({
    authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  });
});

const googleCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  codeVerifier: string | undefined,
): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error("Google OAuth is not configured");
    error.name = "OAUTH_MISSING_CONFIG";
    throw error;
  }

  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (codeVerifier) {
    tokenBody.set("code_verifier", codeVerifier);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    const error = new Error("Google token exchange failed");
    error.name = body.includes("redirect_uri_mismatch")
      ? "OAUTH_CALLBACK_MISMATCH"
      : "OAUTH_PROVIDER_UNAVAILABLE";
    throw error;
  }

  const tokens = (await tokenRes.json()) as { access_token: string; id_token?: string };

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    const error = new Error("Failed to fetch Google user info");
    error.name = "OAUTH_PROVIDER_UNAVAILABLE";
    throw error;
  }
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
    const { code, state, redirectUri } = googleCallbackSchema.parse(req.body);

    // §2.2 — server-side state + PKCE verification. State JWT carries the
    // code_verifier; we use it on the token-exchange call and clear the cookie
    // so it can't be replayed.
    const verification = verifyOAuthState(
      readOAuthStateCookie(req.headers.cookie),
      state,
      "google",
    );
    if (!verification.ok) {
      console.error("Google OAuth state validation failed", { reason: verification.reason });
      res.setHeader("Set-Cookie", buildClearOAuthStateCookie());
      res.status(400).json({
        error: "OAuth state validation failed.",
        code: "OAUTH_STATE_INVALID",
        reason: verification.reason,
      });
      return;
    }
    res.setHeader("Set-Cookie", buildClearOAuthStateCookie());

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const finalRedirect = redirectUri || `${frontendUrl}/auth/callback`;

    const profile = await exchangeGoogleCode(code, finalRedirect, verification.codeVerifier);

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
    const code =
      error instanceof Error && error.name.startsWith("OAUTH_")
        ? error.name
        : "OAUTH_EXCHANGE_FAILED";
    console.error("Google OAuth error:", {
      code,
      message: error instanceof Error ? error.message : "unknown",
    });
    const status = code === "OAUTH_MISSING_CONFIG" ? 503 : code === "OAUTH_CALLBACK_MISMATCH" ? 400 : 502;
    res.status(status).json({
      error: "OAuth authentication failed",
      code,
      message:
        code === "OAUTH_CALLBACK_MISMATCH"
          ? "The OAuth callback URL is not registered for this environment."
          : code === "OAUTH_MISSING_CONFIG"
            ? "Google sign-in is not configured for this environment."
            : "The OAuth provider is unavailable or rejected the sign-in request.",
    });
  }
});

// ---------- GitHub OAuth ----------

// §2.2 — server issues state. GitHub does not support PKCE in the same form
// as Google's OAuth2, so we use signed-cookie state alone (still a meaningful
// improvement over the previous client-stored sessionStorage state).
router.get("/github/start", authLimiter, (_req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({
      error: "GitHub sign-in is not configured for this environment.",
      code: "OAUTH_MISSING_CONFIG",
    });
    return;
  }
  const { state, cookieValue } = generateOAuthState("github");
  res.setHeader("Set-Cookie", buildOAuthStateCookie(cookieValue));
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${frontendUrl}/auth/callback`,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  res.json({
    authorizeUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
  });
});

const githubCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectUri: z.string().url().optional(),
});

interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url?: string;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

async function exchangeGithubCode(code: string, redirectUri: string): Promise<{
  providerUserId: string;
  email?: string;
  name: string;
  avatarUrl?: string;
  emailVerified: boolean;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error("GitHub OAuth is not configured");
    error.name = "OAUTH_MISSING_CONFIG";
    throw error;
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const error = new Error("GitHub token exchange failed");
    error.name = "OAUTH_PROVIDER_UNAVAILABLE";
    throw error;
  }

  const tokenPayload = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenPayload.access_token) {
    const error = new Error(tokenPayload.error_description || "GitHub did not return an access token");
    error.name =
      tokenPayload.error === "redirect_uri_mismatch"
        ? "OAUTH_CALLBACK_MISMATCH"
        : "OAUTH_PROVIDER_UNAVAILABLE";
    throw error;
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenPayload.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userRes.ok) {
    const error = new Error("Failed to fetch GitHub user profile");
    error.name = "OAUTH_PROVIDER_UNAVAILABLE";
    throw error;
  }
  const user = (await userRes.json()) as GithubUser;

  // GitHub returns `email: null` when the user's email is private; fetch the
  // emails list to find their verified primary address.
  let primaryEmail: string | undefined = user.email ?? undefined;
  let emailVerified = false;
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenPayload.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as GithubEmail[];
    const verifiedPrimary = emails.find((e) => e.primary && e.verified);
    if (verifiedPrimary) {
      primaryEmail = verifiedPrimary.email;
      emailVerified = true;
    } else {
      const verifiedAny = emails.find((e) => e.verified);
      if (verifiedAny) {
        primaryEmail = primaryEmail || verifiedAny.email;
        emailVerified = true;
      }
    }
  }

  return {
    providerUserId: String(user.id),
    email: primaryEmail,
    name: user.name || user.login || "GitHub User",
    avatarUrl: user.avatar_url,
    emailVerified,
  };
}

router.post("/github/callback", authLimiter, async (req: Request, res: Response) => {
  try {
    const { code, state, redirectUri } = githubCallbackSchema.parse(req.body);

    const verification = verifyOAuthState(
      readOAuthStateCookie(req.headers.cookie),
      state,
      "github",
    );
    if (!verification.ok) {
      console.error("GitHub OAuth state validation failed", { reason: verification.reason });
      res.setHeader("Set-Cookie", buildClearOAuthStateCookie());
      res.status(400).json({
        error: "OAuth state validation failed.",
        code: "OAUTH_STATE_INVALID",
        reason: verification.reason,
      });
      return;
    }
    res.setHeader("Set-Cookie", buildClearOAuthStateCookie());

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const finalRedirect = redirectUri || `${frontendUrl}/auth/callback`;

    const profile = await exchangeGithubCode(code, finalRedirect);

    return await handleOAuthLogin(res, {
      provider: OAuthProvider.GITHUB,
      providerUserId: profile.providerUserId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      emailVerified: profile.emailVerified,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.issues });
      return;
    }
    const code =
      error instanceof Error && error.name.startsWith("OAUTH_")
        ? error.name
        : "OAUTH_EXCHANGE_FAILED";
    console.error("GitHub OAuth error:", {
      code,
      message: error instanceof Error ? error.message : "unknown",
    });
    const status = code === "OAUTH_MISSING_CONFIG" ? 503 : code === "OAUTH_CALLBACK_MISMATCH" ? 400 : 502;
    res.status(status).json({
      error: "OAuth authentication failed",
      code,
      message:
        code === "OAUTH_CALLBACK_MISMATCH"
          ? "The GitHub OAuth callback URL is not registered for this environment."
          : code === "OAUTH_MISSING_CONFIG"
            ? "GitHub sign-in is not configured for this environment."
            : "GitHub is unavailable or rejected the sign-in request.",
    });
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
  switch (provider) {
    case OAuthProvider.GOOGLE:
      return "Google";
    case OAuthProvider.GITHUB:
      return "GitHub";
    case OAuthProvider.APPLE:
      return "Apple";
  }
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
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (googleId && googleSecret) {
    providers.push({ provider: "google", clientId: googleId, enabled: true });
  }

  const githubId = process.env.GITHUB_CLIENT_ID;
  const githubSecret = process.env.GITHUB_CLIENT_SECRET;
  if (githubId && githubSecret) {
    providers.push({ provider: "github", clientId: githubId, enabled: true });
  }

  const appleId = process.env.APPLE_CLIENT_ID;
  if (appleId) {
    providers.push({ provider: "apple", clientId: appleId, enabled: true });
  }

  res.json({ providers });
});

router.get("/diagnostics", (_req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const githubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const appleConfigured = Boolean(process.env.APPLE_CLIENT_ID);

  res.json({
    environment: process.env.NODE_ENV || "development",
    providers: {
      google: {
        configured: googleConfigured,
        clientSecretConfigured: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        requiredCallbackUrls: [
          `${frontendUrl}/auth/callback`,
          "http://localhost:3000/auth/callback",
        ],
      },
      github: {
        configured: githubConfigured,
        clientSecretConfigured: Boolean(process.env.GITHUB_CLIENT_SECRET),
        requiredCallbackUrls: [
          `${frontendUrl}/auth/callback`,
          "http://localhost:3000/auth/callback",
        ],
      },
      apple: {
        configured: appleConfigured,
        requiredCallbackUrls: [
          `${frontendUrl}/auth/apple/callback`,
          "http://localhost:3000/auth/apple/callback",
        ],
      },
    },
    secretsExposed: false,
  });
});

export default router;
