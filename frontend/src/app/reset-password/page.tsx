"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { passwordReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

function ResetPasswordForm() {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validateForm = () => {
    const errors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      errors["password"] = tp("site.auth.passwordRequired");
    } else if (password.length < 8) {
      errors["password"] = tp("site.auth.passwordMin");
    } else if (!/[A-Z]/.test(password)) {
      errors["password"] = tp("site.auth.passwordUpper");
    } else if (!/[a-z]/.test(password)) {
      errors["password"] = tp("site.auth.passwordLower");
    } else if (!/[0-9]/.test(password)) {
      errors["password"] = tp("site.auth.passwordNumber");
    }

    if (!confirmPassword) {
      errors["confirmPassword"] = tp("site.auth.confirmRequired");
    } else if (password !== confirmPassword) {
      errors["confirmPassword"] = tp("site.auth.passwordMismatch");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;
    if (!token) {
      setError(tp("site.auth.tokenMissing"));
      return;
    }

    setLoading(true);
    try {
      await passwordReset.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : tp("site.auth.requestFailed");
      if (message.toLowerCase().includes("expired") || message.toLowerCase().includes("invalid")) {
        setError(tp("site.auth.tokenExpired"));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold text-fg">{tp("site.auth.invalidLinkTitle")}</h1>
        </CardHeader>
        <CardContent>
          <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">
            {tp("site.auth.invalidLinkBody")}
          </div>
          <div className="text-center text-sm text-fg-secondary">
            <Link href={localizePath("/forgot-password", locale)} className="font-medium text-primary-text hover:underline">
              {tp("site.auth.requestNewLink")}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <h1 className="text-2xl font-bold text-fg">{tp("site.auth.resetTitle")}</h1>
        <p className="text-fg-secondary">{tp("site.auth.resetSubtitle")}</p>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="space-y-4">
            <div role="status" className="rounded-lg border border-success-line bg-success-soft p-3 text-sm text-success">
              {tp("site.auth.resetSuccess")}
            </div>
            <div className="text-center text-sm text-fg-secondary">
              <Link href={localizePath("/login", locale)} className="font-medium text-primary-text hover:underline">
                {t("auth.signIn")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <Input
                id="password"
                type="password"
                label={tp("site.auth.newPassword")}
                autoComplete="new-password"
                placeholder={tp("site.auth.newPasswordPlaceholder")}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: undefined })); }}
                error={fieldErrors.password}
              />

              <Input
                id="confirmPassword"
                type="password"
                label={tp("site.auth.confirmPassword")}
                autoComplete="new-password"
                placeholder={tp("site.auth.confirmPlaceholder")}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: undefined })); }}
                error={fieldErrors.confirmPassword}
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? tp("site.auth.resetting") : tp("site.auth.resetTitle")}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-fg-secondary">
              {tp("site.auth.rememberPassword")}{" "}
              <Link href={localizePath("/login", locale)} className="font-medium text-primary-text hover:underline">
                {t("auth.signIn")}
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Suspense fallback={<div role="status" aria-busy="true" className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
