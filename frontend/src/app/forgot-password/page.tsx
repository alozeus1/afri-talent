"use client";

import { useState } from "react";
import Link from "next/link";
import { passwordReset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

export default function ForgotPasswordPage() {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validateForm = () => {
    const errors: { email?: string } = {};
    if (!email) {
      errors.email = tp("site.auth.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = tp("site.auth.emailInvalid");
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
      await passwordReset.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : tp("site.auth.requestFailed");
      if (message.toLowerCase().includes("rate") || message.toLowerCase().includes("too many")) {
        setError(tp("site.auth.tooManyRequests"));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold text-fg">{tp("site.auth.forgotTitle")}</h1>
          <p className="text-fg-secondary">{tp("site.auth.forgotSubtitle")}</p>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <div role="status" className="rounded-lg border border-success-line bg-success-soft p-3 text-sm text-success">
                {tp("site.auth.forgotSent")}
              </div>
              <div className="text-center text-sm text-fg-secondary">
                <Link href={localizePath("/login", locale)} className="font-medium text-primary-text hover:underline">
                  {tp("site.auth.backToSignIn")}
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
                  id="email"
                  type="email"
                  label={t("auth.email")}
                  autoComplete="email"
                  placeholder={tp("site.auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: undefined })); }}
                  error={fieldErrors.email}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? tp("site.auth.sending") : tp("site.auth.sendResetLink")}
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
    </div>
  );
}
