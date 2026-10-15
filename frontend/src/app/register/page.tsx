"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { getPasswordStrength } from "@/lib/password-strength";
import { Skeleton } from "@/components/ui/skeleton";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { createBotShieldPayload } from "@/lib/bot-shield";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

// lib/password-strength returns English copy; map it onto translated keys.
const STRENGTH_LEVEL_KEYS: Record<string, PublicMessageKey> = {
  "Very weak": "site.auth.strength.veryWeak",
  Weak: "site.auth.strength.weak",
  Fair: "site.auth.strength.fair",
  Strong: "site.auth.strength.strong",
  "Very strong": "site.auth.strength.veryStrong",
};
const STRENGTH_TIP_KEYS: Record<string, PublicMessageKey> = {
  "Use at least 12 characters.": "site.auth.strength.tipLength",
  "Use at least 12 characters for better security.": "site.auth.strength.tipLength",
  "Add an uppercase letter.": "site.auth.strength.tipUpper",
  "Add a lowercase letter.": "site.auth.strength.tipLower",
  "Add a number.": "site.auth.strength.tipNumber",
  "Add a symbol (e.g. !@#$%).": "site.auth.strength.tipSymbol",
};

function RegisterForm() {
  const locale = useLocale();
  const t = useT();
  const tp = usePublicT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();

  const defaultRole = searchParams.get("role") === "employer" ? "EMPLOYER" : "CANDIDATE";

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    role: defaultRole as "CANDIDATE" | "EMPLOYER",
    companyName: "",
    location: "",
  });
  const [honeypot, setHoneypot] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const passwordStrength = getPasswordStrength(formData.password);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name || formData.name.length < 2) {
      errors.name = tp("site.auth.nameMin");
    }
    
    if (!formData.email) {
      errors.email = tp("site.auth.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = tp("site.auth.emailInvalid");
    }
    
    if (!formData.password) {
      errors["password"] = tp("site.auth.passwordRequired");
    } else if (formData.password.length < 8) {
      errors["password"] = tp("site.auth.passwordMin");
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      errors["password"] = tp("site.auth.passwordComplexity");
    }
    
    if (formData.role === "EMPLOYER" && !formData.companyName.trim()) {
      errors.companyName = tp("site.auth.companyRequired");
    }

    // Backend rejects employer sign-up without a location; flag it inline.
    if (formData.role === "EMPLOYER" && !formData.location.trim()) {
      errors.location = tp("site.auth.locationRequired");
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
      await register(formData, {
        botShield: createBotShieldPayload(formStartedAt, honeypot),
      });
      router.push(localizePath(formData.role === "EMPLOYER" ? "/employer" : "/candidate", locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("site.auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <h1 className="text-2xl font-bold text-fg">{tp("site.auth.registerTitle")}</h1>
        <p className="text-fg-secondary">{tp("site.auth.registerSubtitle")}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="sr-only" aria-hidden="true">
            <label htmlFor="website">{tp("site.auth.honeypot")}</label>
            <input
              id="website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-fg-secondary">{t("auth.iAm")}</legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "CANDIDATE"
                    ? "border-primary bg-success-soft text-primary-text"
                    : "border-line hover:border-line-strong"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
                aria-pressed={formData.role === "CANDIDATE"}
                onClick={() => updateField("role", "CANDIDATE")}
              >
                <span className="font-medium">{t("auth.candidate")}</span>
                <p className="text-xs text-fg-muted mt-1">{t("auth.lookingForJobs")}</p>
              </button>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "EMPLOYER"
                    ? "border-primary bg-success-soft text-primary-text"
                    : "border-line hover:border-line-strong"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus`}
                aria-pressed={formData.role === "EMPLOYER"}
                onClick={() => updateField("role", "EMPLOYER")}
              >
                <span className="font-medium">{t("auth.employer")}</span>
                <p className="text-xs text-fg-muted mt-1">{t("auth.hiringTalent")}</p>
              </button>
            </div>
          </fieldset>

          <Input
            id="name"
            type="text"
            label={t("auth.fullName")}
            autoComplete="name"
            placeholder={tp("site.auth.namePlaceholder")}
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            error={fieldErrors.name}
          />

          <Input
            id="email"
            type="email"
            label={t("auth.email")}
            autoComplete="email"
            placeholder={tp("site.auth.emailPlaceholder")}
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            error={fieldErrors.email}
          />

          <Input
            id="password"
            type="password"
            label={t("auth.password")}
            autoComplete="new-password"
            placeholder={tp("site.auth.newPasswordPlaceholder")}
            value={formData.password}
            onChange={(e) => updateField("password", e.target.value)}
            error={fieldErrors.password}
          />
          {formData.password && (
            <div className="rounded-lg border border-line p-3 bg-surface-sunken" aria-live="polite">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-fg-secondary">{tp("site.auth.strength.label")}</span>
                <span className="text-xs font-semibold text-fg">{tp(STRENGTH_LEVEL_KEYS[passwordStrength.level] ?? "site.auth.strength.fair")}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-muted mb-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    passwordStrength.score <= 1
                      ? "bg-red-500"
                      : passwordStrength.score === 2
                        ? "bg-amber-500"
                        : passwordStrength.score === 3
                          ? "bg-emerald-500"
                          : "bg-emerald-600"
                  }`}
                  style={{ width: `${passwordStrength.percentage}%` }}
                  role="progressbar"
                  aria-valuenow={passwordStrength.percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={tp("site.auth.strength.label")}
                />
              </div>
              <p className="text-xs text-fg-secondary">
                {passwordStrength.score >= 3
                  ? tp("site.auth.strength.great")
                  : passwordStrength.feedback
                      .slice(0, 2)
                      .map((tip) => (STRENGTH_TIP_KEYS[tip] ? tp(STRENGTH_TIP_KEYS[tip]) : tip))
                      .join(" ")}
              </p>
            </div>
          )}

          {formData.role === "EMPLOYER" && (
            <>
              <Input
                id="companyName"
                type="text"
                label={tp("site.auth.companyName")}
                autoComplete="organization"
                placeholder={tp("site.auth.companyPlaceholder")}
                value={formData.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                error={fieldErrors.companyName}
              />
              <Input
                id="location"
                type="text"
                label={tp("site.auth.companyLocation")}
                placeholder={tp("site.auth.locationPlaceholder")}
                value={formData.location}
                onChange={(e) => updateField("location", e.target.value)}
                error={fieldErrors.location}
              />
            </>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? tp("site.auth.creatingAccount") : t("auth.createAccount")}
          </Button>
        </form>

        <OAuthButtons mode="register" onError={(oauthError) => setError(oauthError)} />

        <div className="mt-6 text-center text-sm text-fg-secondary">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href={localizePath("/login", locale)} className="font-medium text-primary-text hover:underline">
            {t("auth.signIn")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Suspense fallback={
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      }>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
