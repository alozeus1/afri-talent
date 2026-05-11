"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type OAuthProvider = "google" | "github" | "apple";

// §2.2 — state for Google + GitHub is held in an HttpOnly cookie set by the
// backend; only the chosen provider is echoed via sessionStorage so this
// page can route to the right backend endpoint. Apple still echoes its own
// legacy state until Wave 2 removes that provider entirely.
function readStoredOAuthProvider(): OAuthProvider | null {
  if (typeof window === "undefined") return null;
  const provider = sessionStorage.getItem("oauth_provider");
  return provider === "google" || provider === "github" || provider === "apple"
    ? (provider as OAuthProvider)
    : null;
}

function clearStoredOAuthSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("oauth_provider");
}

function describeOAuthError(codeOrMessage: string): string {
  const normalized = codeOrMessage.toUpperCase();
  if (normalized.includes("OAUTH_CALLBACK_MISMATCH") || normalized.includes("REDIRECT_URI")) {
    return "Google sign-in is almost configured, but this callback URL is not registered for the current environment. Ask an admin to add this app URL in Google Cloud OAuth settings.";
  }
  if (normalized.includes("OAUTH_MISSING_CONFIG") || normalized.includes("NOT CONFIGURED")) {
    return "Google sign-in is not configured for this environment yet. You can continue with email and password.";
  }
  if (normalized.includes("ACCESS_DENIED") || normalized.includes("USER_CANCEL")) {
    return "Sign-in was cancelled. You can try again or continue with email and password.";
  }
  if (normalized.includes("OAUTH_PROVIDER_UNAVAILABLE")) {
    return "The OAuth provider is temporarily unavailable. Try again later or continue with email and password.";
  }
  return codeOrMessage || "Authentication failed. Try again or continue with email and password.";
}

function OAuthCallbackInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const providerParam = searchParams.get("provider");
    const stateParam = searchParams.get("state");
    const idToken = searchParams.get("id_token");
    const encodedUser = searchParams.get("user");
    const storedProvider = readStoredOAuthProvider();
    const provider: OAuthProvider =
      providerParam === "apple" || providerParam === "google" || providerParam === "github"
        ? (providerParam as OAuthProvider)
        : idToken
          ? "apple"
          : (storedProvider || "google");

    if (errorParam) {
      trackEvent("oauth_error", {
        provider,
        stage: "provider_redirect",
        error: errorParam,
      });
      setError(describeOAuthError(errorParam));
      clearStoredOAuthSession();
      return;
    }

    if (!code && (provider === "google" || provider === "github")) {
      trackEvent("oauth_error", {
        provider,
        stage: "missing_code",
      });
      setError("No authorization code was received from the provider. Try signing in again.");
      clearStoredOAuthSession();
      return;
    }

    if ((provider === "google" || provider === "github") && !stateParam) {
      trackEvent("oauth_error", {
        provider,
        stage: "missing_state",
      });
      setError("The provider did not return a state value. Please try signing in again.");
      clearStoredOAuthSession();
      return;
    }

    const exchangeCode = async () => {
      try {
        trackEvent("oauth_callback_received", {
          provider,
          has_code: Boolean(code),
          has_id_token: Boolean(idToken),
        });

        const redirectUri =
          provider === "apple"
            ? `${window.location.origin}/auth/apple/callback`
            : `${window.location.origin}/auth/callback`;

        const endpointByProvider: Record<OAuthProvider, string> = {
          google: `${API_URL}/api/auth/oauth/google/callback`,
          github: `${API_URL}/api/auth/oauth/github/callback`,
          apple: `${API_URL}/api/auth/oauth/apple/callback`,
        };
        const endpoint = endpointByProvider[provider];

        let parsedAppleUser: { name?: string; email?: string } | undefined;
        if (encodedUser) {
          try {
            parsedAppleUser = JSON.parse(encodedUser) as { name?: string; email?: string };
          } catch {
            parsedAppleUser = undefined;
          }
        }

        const payload =
          provider === "apple"
            ? { code, idToken, user: parsedAppleUser }
            : { code, state: stateParam, redirectUri };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.code || data.message || data.error || "OAuth failed");
        }

        trackEvent(data.isNewUser ? "oauth_signup" : "oauth_login", {
          provider,
        });
        trackEvent("oauth_success", {
          provider,
          is_new_user: Boolean(data.isNewUser),
        });
        clearStoredOAuthSession();

        // Redirect based on role
        const role = data.user?.role;
        if (role === "EMPLOYER") {
          window.location.assign("/employer");
        } else if (role === "ADMIN") {
          window.location.assign("/admin");
        } else {
          window.location.assign("/candidate");
        }
      } catch (err) {
        trackEvent("oauth_error", {
          provider,
          stage: "exchange",
        });
        setError(describeOAuthError(err instanceof Error ? err.message : "Authentication failed"));
        clearStoredOAuthSession();
      }
    };

    exchangeCode();
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Authentication Failed</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
          <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-300">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    }>
      <OAuthCallbackInner />
    </Suspense>
  );
}
