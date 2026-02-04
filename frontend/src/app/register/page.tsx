"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function RegisterForm() {
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
      router.push(formData.role === "EMPLOYER" ? "/employer" : "/candidate");
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
        <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
        <p className="text-gray-600">Join the AfriTalent community</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">I am a</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "CANDIDATE"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => updateField("role", "CANDIDATE")}
              >
                <span className="font-medium">Candidate</span>
                <p className="text-xs text-gray-500 mt-1">Looking for jobs</p>
              </button>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 text-center transition-colors ${
                  formData.role === "EMPLOYER"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => updateField("role", "EMPLOYER")}
              >
                <span className="font-medium">Employer</span>
                <p className="text-xs text-gray-500 mt-1">Hiring talent</p>
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
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <Suspense fallback={<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
