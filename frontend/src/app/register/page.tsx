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

function RegisterForm() {
  const locale = useLocale();
  const t = useT();
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
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const passwordStrength = getPasswordStrength(formData.password);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name || formData.name.length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    
    if (!formData.email) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Please enter a valid email";
    }
    
    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }
    
    if (formData.role === "EMPLOYER" && !formData.companyName) {
      errors.companyName = "Company name is required";
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
      await register(formData);
      router.push(localizePath(formData.role === "EMPLOYER" ? "/employer" : "/candidate", locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create Your Account</h1>
        <p className="text-gray-600 dark:text-gray-300">Join the AfriTalent community</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">I am a</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "CANDIDATE"
                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
                onClick={() => updateField("role", "CANDIDATE")}
              >
                <span className="font-medium">Candidate</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Looking for jobs</p>
              </button>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "EMPLOYER"
                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
                onClick={() => updateField("role", "EMPLOYER")}
              >
                <span className="font-medium">Employer</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hiring talent</p>
              </button>
            </div>
          </div>

          <Input
            id="name"
            type="text"
            label="Full Name"
            placeholder="Your name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            error={fieldErrors.name}
          />

          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            error={fieldErrors.email}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="At least 8 characters"
            value={formData.password}
            onChange={(e) => updateField("password", e.target.value)}
            error={fieldErrors.password}
          />
          {formData.password && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Password strength</span>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{passwordStrength.level}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 mb-2 overflow-hidden">
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
                  aria-label="Password strength"
                />
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                {passwordStrength.score >= 3
                  ? "Great password. You're in good shape."
                  : passwordStrength.feedback.slice(0, 2).join(" ")}
              </p>
            </div>
          )}

          {formData.role === "EMPLOYER" && (
            <>
              <Input
                id="companyName"
                type="text"
                label="Company Name"
                placeholder="Your company"
                value={formData.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
                error={fieldErrors.companyName}
              />
              <Input
                id="location"
                type="text"
                label="Company Location"
                placeholder="e.g., Remote, Lagos, Nigeria"
                value={formData.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
            </>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : t("auth.createAccount")}
          </Button>
        </form>

        <OAuthButtons mode="register" onError={(oauthError) => setError(oauthError)} />

        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link href={localizePath("/login", locale)} className="text-emerald-600 hover:text-emerald-700 font-medium">
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
