"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type OAuthProvider = "google" | "github";

function readStoredOAuthState(): { state: string | null; provider: OAuthProvider | null } {
  if (typeof window === "undefined") {
    return { state: null, provider: null };
  }

  const state = sessionStorage.getItem("oauth_state");
  const provider = sessionStorage.getItem("oauth_provider");
  return {
    state,
    provider:
      provider === "google" || provider === "github"
        ? (provider as OAuthProvider)
        : null,
  };
}

function clearStoredOAuthState() {
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
    const { state: storedState, provider: storedProvider } = readStoredOAuthState();
    const provider: OAuthProvider =
      providerParam === "google" || providerParam === "github"
        ? (providerParam as OAuthProvider)
        : (storedProvider || "google");

    if (errorParam) {
      trackEvent("oauth_error", {
        provider,
        stage: "provider_redirect",
        error: errorParam,
      });
      setError(describeOAuthError(errorParam));
      clearStoredOAuthState();
      return;
    }

    if (!code) {
      trackEvent("oauth_error", {
        provider,
        stage: "missing_code",
      });
      setError("No authorization code was received from the provider. Try signing in again.");
      clearStoredOAuthState();
      return;
    }

    if (stateParam && storedState && stateParam !== storedState) {
      trackEvent("oauth_error", {
        provider,
        stage: "state_validation",
      });
      setError("Authentication state mismatch. Please try signing in again.");
      clearStoredOAuthState();
      return;
    }

    const exchangeCode = async () => {
      try {
        trackEvent("oauth_callback_received", {
          provider,
          has_code: Boolean(code),
        });

        const redirectUri = `${window.location.origin}/auth/callback`;

        const endpointByProvider: Record<OAuthProvider, string> = {
          google: `${API_URL}/api/auth/oauth/google/callback`,
          github: `${API_URL}/api/auth/oauth/github/callback`,
        };
        const endpoint = endpointByProvider[provider];

        const payload = { code, redirectUri };

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
        clearStoredOAuthState();

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
        clearStoredOAuthState();
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
