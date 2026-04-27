"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Skeleton } from "@/components/ui/skeleton";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { createBotShieldPayload } from "@/lib/bot-shield";

const SHOW_DEMO_CREDENTIALS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

function LoginForm() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      const rolePath = user.role ? `/${user.role.toLowerCase()}` : "/";
      const redirect = searchParams.get("redirect") || localizePath(rolePath, locale);
      router.push(redirect);
    }
  }, [user, loading, router, searchParams, locale]);

  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    
    if (!email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email";
    }
    
    if (!password) {
      errors.password = "Password is required";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      await login(email, password, {
        botShield: createBotShieldPayload(formStartedAt, honeypot),
      });
      // The useEffect will handle the redirect once the user object is populated
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("auth.welcomeBack")}</h1>
        <p className="text-gray-600 dark:text-gray-300">{t("auth.signInToAccount")}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="sr-only" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: undefined })); }}
            error={fieldErrors.email}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: undefined })); }}
            error={fieldErrors.password}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : t("auth.signIn")}
          </Button>

          <div className="text-right">
            <Link href={localizePath("/forgot-password", locale)} className="text-sm text-emerald-600 hover:text-emerald-700">
              Forgot your password?
            </Link>
          </div>
        </form>

        <OAuthButtons mode="login" onError={(oauthError) => setError(oauthError)} />

        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">
          {t("auth.dontHaveAccount")}{" "}
          <Link href={localizePath("/register", locale)} className="text-emerald-600 hover:text-emerald-700 font-medium">
            {t("auth.createAccount")}
          </Link>
        </div>

        {SHOW_DEMO_CREDENTIALS && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm text-gray-600 dark:text-gray-300">
            <p className="font-medium mb-2">Demo Credentials:</p>
            <p>Candidate: candidate@example.com</p>
            <p>Employer: employer@example.com</p>
            <p>Admin: admin@example.com</p>
            <p className="mt-1">Password: Password123!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Suspense fallback={
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
