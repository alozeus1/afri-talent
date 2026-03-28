"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { EmployerTrustDashboard, jobs, trust } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrustBadge } from "@/components/trust/trust-badge";
import { localizePath, useLocale } from "@/lib/i18n/client";

const jobTypes = ["Full-time", "Part-time", "Contract", "Freelance", "Internship"];
const seniorityLevels = ["Junior", "Mid-level", "Senior", "Lead", "Executive"];

export default function NewJobPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const [trustDashboard, setTrustDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [loadingTrust, setLoadingTrust] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    type: "Full-time",
    seniority: "Mid-level",
    salaryMin: "",
    salaryMax: "",
    currency: "USD",
    tags: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      trust
        .employerSummary()
        .then(setTrustDashboard)
        .catch(() => {})
        .finally(() => setLoadingTrust(false));
    } else {
      setLoadingTrust(false);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (trustDashboard && !trustDashboard.trust.postingEligibility) {
      setError("Complete the required employer trust checks before posting publicly.");
      return;
    }

    setLoading(true);

    try {
      await jobs.create(
        {
          title: formData.title,
          description: formData.description,
          location: formData.location,
          type: formData.type,
          seniority: formData.seniority,
          salaryMin: formData.salaryMin ? parseInt(formData.salaryMin) : undefined,
          salaryMax: formData.salaryMax ? parseInt(formData.salaryMax) : undefined,
          currency: formData.currency || undefined,
          tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : undefined,
        }
      );
      router.push(localizePath("/employer", locale));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (step === 1 && (!formData.title || !formData.description || !formData.location)) {
      setError("Please complete title, description, and location before continuing.");
      return;
    }
    if (trustDashboard && !trustDashboard.trust.postingEligibility) {
      setError("Finish employer verification before continuing to publish.");
      return;
    }
    if (step === 2 && (!formData.type || !formData.seniority)) {
      setError("Please complete role details before continuing.");
      return;
    }
    setError(null);
    setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev));
  };

  const prevStep = () => {
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev));
  };

  if (!user || user.role !== "EMPLOYER") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600 mb-4">You must be logged in as an employer to post jobs.</p>
        <Link href={localizePath("/login", locale)}>
          <Button>Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href={localizePath("/employer", locale)} className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900">Post a New Job</h1>
          <p className="text-gray-600">
            Trusted employers publish faster. Higher-risk jobs are held for moderation before they go live.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { n: 1, label: "Basics" },
              { n: 2, label: "Role Details" },
              { n: 3, label: "Publish" },
            ].map((item) => (
              <div
                key={item.n}
                className={`rounded-md px-3 py-2 text-xs font-medium text-center ${
                  step >= item.n ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {item.n}. {item.label}
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loadingTrust ? (
            <div className="mb-6 flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-emerald-600" />
            </div>
          ) : trustDashboard ? (
            <div className={`mb-6 rounded-2xl border px-4 py-4 ${trustDashboard.trust.postingEligibility ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <TrustBadge
                      label={trustDashboard.trust.badge}
                      riskLevel={trustDashboard.trust.riskLevel}
                      variant="success"
                    />
                    {trustDashboard.trust.verifiedDomain && (
                      <TrustBadge label={`Domain matched: ${trustDashboard.trust.verifiedDomain}`} variant="info" />
                    )}
                  </div>
                  <p className="mt-3 text-sm text-gray-700">
                    {trustDashboard.trust.postingEligibility
                      ? "Your account meets the current minimum threshold for public posting."
                      : "Public posting is blocked until the minimum employer trust threshold is met."}
                  </p>
                  {trustDashboard.trust.warnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-gray-700">
                      {trustDashboard.trust.warnings.map((warning) => (
                        <li key={warning}>• {warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link href={localizePath("/employer/trust", locale)}>
                  <Button variant={trustDashboard.trust.postingEligibility ? "outline" : "primary"}>
                    {trustDashboard.trust.postingEligibility ? "Review trust profile" : "Complete verification"}
                  </Button>
                </Link>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
            )}

            {step === 1 && (
              <>
                <Input
                  id="title"
                  label="Job Title"
                  placeholder="e.g., Senior Full-Stack Engineer"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  required
                />

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Job Description
                  </label>
                  <textarea
                    id="description"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[200px]"
                    placeholder="Describe the role, responsibilities, requirements, and benefits..."
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    required
                  />
                </div>

                <Input
                  id="location"
                  label="Location"
                  placeholder="e.g., Remote, Lagos, Nigeria"
                  value={formData.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  required
                />
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                      Job Type
                    </label>
                    <select
                      id="type"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.type}
                      onChange={(e) => updateField("type", e.target.value)}
                    >
                      {jobTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="seniority" className="block text-sm font-medium text-gray-700 mb-1">
                      Seniority Level
                    </label>
                    <select
                      id="seniority"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.seniority}
                      onChange={(e) => updateField("seniority", e.target.value)}
                    >
                      {seniorityLevels.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Input
                    id="salaryMin"
                    type="number"
                    label="Min Salary (optional)"
                    placeholder="60000"
                    value={formData.salaryMin}
                    onChange={(e) => updateField("salaryMin", e.target.value)}
                  />
                  <Input
                    id="salaryMax"
                    type="number"
                    label="Max Salary (optional)"
                    placeholder="90000"
                    value={formData.salaryMax}
                    onChange={(e) => updateField("salaryMax", e.target.value)}
                  />
                  <div>
                    <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <select
                      id="currency"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.currency}
                      onChange={(e) => updateField("currency", e.target.value)}
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="NGN">NGN</option>
                      <option value="KES">KES</option>
                      <option value="ZAR">ZAR</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Input
                  id="tags"
                  label="Skills / Tags (comma-separated)"
                  placeholder="e.g., React, Node.js, PostgreSQL"
                  value={formData.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                />
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-semibold mb-2">Review</p>
                  <p><strong>Title:</strong> {formData.title}</p>
                  <p><strong>Location:</strong> {formData.location}</p>
                  <p><strong>Type:</strong> {formData.type}</p>
                  <p><strong>Seniority:</strong> {formData.seniority}</p>
                  <p><strong>Salary:</strong> {formData.salaryMin || "-"} - {formData.salaryMax || "-"} {formData.currency}</p>
                </div>
              </>
            )}

            <div className="flex gap-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={prevStep}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button type="button" className="flex-1" onClick={nextStep}>
                  Continue
                </Button>
              ) : (
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Creating..." : "Post Job"}
                </Button>
              )}
              <Link href={localizePath("/employer", locale)}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
