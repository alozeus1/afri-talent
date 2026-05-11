"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface OAuthProvider {
  provider: string;
  clientId: string;
  enabled: boolean;
}

interface OAuthButtonsProps {
  mode: "login" | "register";
  onError?: (error: string) => void;
}

function trackOAuthEvent(action: string, provider: string) {
  trackEvent(action, {
    event_category: "oauth",
    event_label: provider,
  });
}

// §2.2 — provider state is issued by the backend (HttpOnly cookie + signed
// JWT). Frontend just remembers which provider the user picked so
// /auth/callback can route the code to the right backend endpoint.
function rememberProvider(provider: "google" | "github"): void {
  sessionStorage.setItem("oauth_provider", provider);
}

export function OAuthButtons({ mode, onError }: OAuthButtonsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/oauth/providers`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const loadedProviders = d.providers || [];
        setProviders(loadedProviders);
        if (loadedProviders.length > 0) {
          trackEvent("oauth_buttons_visible", {
            providers: loadedProviders.map((p: OAuthProvider) => p.provider).join(","),
            mode,
          });
        }
      })
      .catch(() => {
        onErrorRef.current?.("Unable to load social sign-in options.");
      });
  }, [mode]);

  const startProviderFlow = useCallback(
    async (provider: "google" | "github") => {
      setLoading(provider);
      trackOAuthEvent("oauth_start", provider);
      try {
        const res = await fetch(`${API_URL}/api/auth/oauth/${provider}/start`, {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Failed to start ${provider} OAuth (${res.status})`);
        }
        const data = (await res.json()) as { authorizeUrl?: string };
        if (!data.authorizeUrl) {
          throw new Error(`Missing authorizeUrl from ${provider} OAuth start`);
        }
        rememberProvider(provider);
        window.location.href = data.authorizeUrl;
      } catch (err) {
        setLoading(null);
        onErrorRef.current?.(
          err instanceof Error
            ? err.message
            : `Could not start ${provider === "google" ? "Google" : "GitHub"} sign-in.`,
        );
      }
    },
    [],
  );

  const handleGoogleLogin = useCallback(() => {
    if (!providers.find((p) => p.provider === "google")) {
      onErrorRef.current?.("Google sign in is not available right now.");
      return;
    }
    void startProviderFlow("google");
  }, [providers, startProviderFlow]);

  const handleGithubLogin = useCallback(() => {
    if (!providers.find((p) => p.provider === "github")) {
      onErrorRef.current?.("GitHub sign in is not available right now.");
      return;
    }
    void startProviderFlow("github");
  }, [providers, startProviderFlow]);

  const googleEnabled = providers.some((p) => p.provider === "google");
  const githubEnabled = providers.some((p) => p.provider === "github");

  if (!googleEnabled && !githubEnabled) return null;

  return (
    <div className="mt-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white dark:bg-gray-900 px-4 text-gray-500 dark:text-gray-400">Or continue with</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {googleEnabled && (
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 disabled:opacity-50 transition-colors"
          >
            {loading === "google" ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-emerald-600 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {mode === "login" ? "Sign in with Google" : "Sign up with Google"}
          </button>
        )}

        {githubEnabled && (
          <button
            type="button"
            onClick={handleGithubLogin}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-900 dark:bg-gray-100 px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 shadow-sm hover:bg-black dark:hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 disabled:opacity-50 transition-colors"
          >
            {loading === "github" ? (
              <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.07c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.25 5.64.41.35.78 1.04.78 2.11v3.13c0 .3.21.65.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            )}
            {mode === "login" ? "Sign in with GitHub" : "Sign up with GitHub"}
          </button>
        )}

      </div>
    </div>
  );
}
