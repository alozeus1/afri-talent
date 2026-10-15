"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicT } from "@/lib/i18n/public-messages";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type OAuthProvider = "google" | "github";

// §2.2 — state for Google + GitHub is held in an HttpOnly cookie set by the
// backend; only the chosen provider is echoed via sessionStorage so this
// page can route to the right backend endpoint.
function readStoredOAuthProvider(): OAuthProvider | null {
  if (typeof window === "undefined") return null;
  const provider = sessionStorage.getItem("oauth_provider");
  return provider === "google" || provider === "github"
    ? (provider as OAuthProvider)
    : null;
}

function clearStoredOAuthSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("oauth_state");
  sessionStorage.removeItem("oauth_provider");
}

function describeOAuthError(codeOrMessage: string, tp: PublicT): string {
  const normalized = codeOrMessage.toUpperCase();
  if (normalized.includes("OAUTH_CALLBACK_MISMATCH") || normalized.includes("REDIRECT_URI")) {
    return tp("site.oauth.errMismatch");
  }
  if (normalized.includes("OAUTH_MISSING_CONFIG") || normalized.includes("NOT CONFIGURED")) {
    return tp("site.oauth.errMissingConfig");
  }
  if (normalized.includes("ACCESS_DENIED") || normalized.includes("USER_CANCEL")) {
    return tp("site.oauth.errCancelled");
  }
  if (normalized.includes("OAUTH_PROVIDER_UNAVAILABLE")) {
    return tp("site.oauth.errUnavailable");
  }
  return codeOrMessage || tp("site.oauth.errGeneric");
}

function OAuthCallbackInner() {
  const searchParams = useSearchParams();
  const tp = usePublicT();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const providerParam = searchParams.get("provider");
    const stateParam = searchParams.get("state");
    const storedProvider = readStoredOAuthProvider();
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
      setError(describeOAuthError(errorParam, tp));
      clearStoredOAuthSession();
      return;
    }

    if (!code) {
      trackEvent("oauth_error", {
        provider,
        stage: "missing_code",
      });
      setError(tp("site.oauth.errNoCode"));
      clearStoredOAuthSession();
      return;
    }

    if ((provider === "google" || provider === "github") && !stateParam) {
      trackEvent("oauth_error", {
        provider,
        stage: "missing_state",
      });
      setError(tp("site.oauth.errNoState"));
      clearStoredOAuthSession();
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

        const payload = { code, state: stateParam, redirectUri };

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
        setError(describeOAuthError(err instanceof Error ? err.message : "", tp));
        clearStoredOAuthSession();
      }
    };

    exchangeCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run the code exchange once per callback URL
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-danger-soft rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-fg mb-2">{tp("site.oauth.failedTitle")}</h2>
          <p className="text-fg-secondary mb-4">{error}</p>
          <Link href={localizePath("/login", locale)} className="font-medium text-primary-text hover:underline">
            {tp("site.auth.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-4" />
        <p role="status" className="text-fg-secondary">{tp("site.oauth.completing")}</p>
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
