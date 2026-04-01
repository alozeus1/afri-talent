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

function createOAuthState(provider: "google" | "apple"): string {
  const randomPart = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const state = `${provider}:${randomPart}`;
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("oauth_provider", provider);
  return state;
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

  const handleGoogleLogin = useCallback(async () => {
    const google = providers.find((p) => p.provider === "google");
    if (!google) {
      onErrorRef.current?.("Google sign in is not available right now.");
      return;
    }

    setLoading("google");
    trackOAuthEvent("oauth_start", "google");

    const redirectUri = `${window.location.origin}/auth/callback`;
    const state = createOAuthState("google");
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, [providers]);

  const handleAppleLogin = useCallback(async () => {
    const apple = providers.find((p) => p.provider === "apple");
    if (!apple) {
      onErrorRef.current?.("Apple sign in is not available right now.");
      return;
    }

    setLoading("apple");
    trackOAuthEvent("oauth_start", "apple");

    const redirectUri = `${window.location.origin}/auth/apple/callback`;
    const state = createOAuthState("apple");
    const nonce = Math.random().toString(36).slice(2);
    const params = new URLSearchParams({
      client_id: apple.clientId,
      redirect_uri: redirectUri,
      response_type: "code id_token",
      scope: "name email",
      response_mode: "form_post",
      state,
      nonce,
    });

    window.location.href = `https://appleid.apple.com/auth/authorize?${params}`;
  }, [providers]);

  const googleEnabled = providers.some((p) => p.provider === "google");
  const appleEnabled = providers.some((p) => p.provider === "apple");

  if (!googleEnabled && !appleEnabled) return null;

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

        {appleEnabled && (
          <button
            type="button"
            onClick={handleAppleLogin}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-black px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-950 disabled:opacity-50 transition-colors"
          >
            {loading === "apple" ? (
              <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
            )}
            {mode === "login" ? "Sign in with Apple" : "Sign up with Apple"}
          </button>
        )}
      </div>
    </div>
  );
}
