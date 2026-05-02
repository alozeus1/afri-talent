"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  EmployerJobPreview,
  EmployerTrustDashboard,
  employerAnalytics,
  jobs,
  trust,
} from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { EmployerJobPostingPreview } from "@/components/employer/job-posting-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const [preview, setPreview] = useState<EmployerJobPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    applicationUrl: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string; pending: boolean; pendingReason: string | null } | null>(null);

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

  const previewPayload = useMemo(() => {
    if (!formData.title || !formData.description || !formData.location || !formData.type || !formData.seniority) {
      return null;
    }

    return {
      title: formData.title,
      description: formData.description,
      location: formData.location,
      type: formData.type,
      seniority: formData.seniority,
      salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : null,
      salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : null,
      currency: formData.currency || null,
      tags: formData.tags
        ? formData.tags.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    };
  }, [formData]);

  useEffect(() => {
    if (!user || user.role !== "EMPLOYER" || !previewPayload) {
      setPreview(null);
      return;
    }

    const timeout = setTimeout(() => {
      setPreviewLoading(true);
      employerAnalytics
        .jobPreview(previewPayload)
        .then((response) => {
          setPreview(response);
          employerOnboardingEvents.jobQualityPreviewViewed({
            quality_score: response.qualityScore,
            moderation_risk: response.moderationRiskLevel,
            moderation_required: response.moderationRequired,
          });
        })
        .catch(() => {
          setPreview(null);
        })
        .finally(() => setPreviewLoading(false));
    }, 500);

    return () => clearTimeout(timeout);
  }, [previewPayload, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (trustDashboard && !trustDashboard.trust.postingEligibility) {
      setError("Complete the required employer trust checks before posting publicly.");
      return;
    }

    setLoading(true);

    try {
      const result = await jobs.create({
        title: formData.title,
        description: formData.description,
        location: formData.location,
        type: formData.type,
        seniority: formData.seniority,
        salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : undefined,
        salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : undefined,
        currency: formData.currency || undefined,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        applicationUrl: formData.applicationUrl || undefined,
      });
      setSubmitted({
        jobId: result.id,
        pending: !!result.pendingReason,
        pendingReason: result.pendingReason ?? null,
      });
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
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="mb-4 text-gray-600">You must be logged in as an employer to post jobs.</p>
        <Link href={localizePath("/login", locale)}>
          <Button>Login</Button>
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${submitted.pending ? "bg-amber-100" : "bg-emerald-100"}`}>
          {submitted.pending ? (
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {submitted.pending ? "Job submitted for review" : "Job published!"}
        </h1>
        <p className="text-gray-600 mb-8">
          {submitted.pending
            ? submitted.pendingReason
            : "Your job is live and visible to candidates now."}
        </p>
        <div className="flex justify-center gap-4">
          <Link href={localizePath("/employer", locale)}>
            <Button>Go to dashboard</Button>
          </Link>
          {submitted.pending && (
            <Link href={localizePath("/employer/trust", locale)}>
              <Button variant="outline">Complete verification</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href={localizePath("/employer", locale)} className="mb-6 inline-flex items-center text-emerald-600 hover:text-emerald-700">
        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
              Guided job launch
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">Post a credible job that can get to shortlist fast</h1>
            <p className="mt-2 text-sm text-gray-600">
              Trusted employers publish faster. Inline moderation guidance helps you fix risky or low-signal drafts before candidates ever see them.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { n: 1, label: "Basics" },
                { n: 2, label: "Role details" },
                { n: 3, label: "Publish" },
              ].map((item) => (
                <div
                  key={item.n}
                  className={`rounded-2xl px-3 py-3 text-center text-xs font-medium ${
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
              <div className={`mb-6 rounded-3xl border px-4 py-4 ${trustDashboard.trust.postingEligibility ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
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
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
              )}

              {step === 1 && (
                <>
                  <Input
                    id="title"
                    label="Job title"
                    placeholder="Senior Full-Stack Engineer"
                    value={formData.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    required
                  />

                  <div>
                    <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
                      Job description
                    </label>
                    <textarea
                      id="description"
                      className="min-h-[220px] w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Describe the mission, responsibilities, outcomes, requirements, and candidate fit."
                      value={formData.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      required
                    />
                  </div>

                  <Input
                    id="location"
                    label="Location"
                    placeholder="Remote, Lagos, Nigeria, or Europe timezone"
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
                      <label htmlFor="type" className="mb-1 block text-sm font-medium text-gray-700">
                        Job type
                      </label>
                      <select
                        id="type"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={formData.type}
                        onChange={(e) => updateField("type", e.target.value)}
                      >
                        {jobTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="seniority" className="mb-1 block text-sm font-medium text-gray-700">
                        Seniority level
                      </label>
                      <select
                        id="seniority"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                      label="Min salary"
                      placeholder="60000"
                      value={formData.salaryMin}
                      onChange={(e) => updateField("salaryMin", e.target.value)}
                    />
                    <Input
                      id="salaryMax"
                      type="number"
                      label="Max salary"
                      placeholder="90000"
                      value={formData.salaryMax}
                      onChange={(e) => updateField("salaryMax", e.target.value)}
                    />
                    <div>
                      <label htmlFor="currency" className="mb-1 block text-sm font-medium text-gray-700">
                        Currency
                      </label>
                      <select
                        id="currency"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

                  <Input
                    id="tags"
                    label="Skills or tags"
                    placeholder="React, Node.js, PostgreSQL"
                    value={formData.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                  />
                  <Input
                    id="applicationUrl"
                    label="Optional employer application link"
                    placeholder="https://company.com/careers/job-id"
                    value={formData.applicationUrl}
                    onChange={(e) => updateField("applicationUrl", e.target.value)}
                  />
                  <p className="-mt-2 text-sm text-gray-500">
                    Leave this blank to receive applications directly on AfriTalent. Add it when candidates should also be able to continue on your company careers site.
                  </p>
                </>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    <p className="mb-2 font-semibold">Publish review</p>
                    <p><strong>Title:</strong> {formData.title}</p>
                    <p><strong>Location:</strong> {formData.location}</p>
                    <p><strong>Type:</strong> {formData.type}</p>
                    <p><strong>Seniority:</strong> {formData.seniority}</p>
                    <p>
                      <strong>Salary:</strong> {formData.salaryMin || "-"} - {formData.salaryMax || "-"} {formData.currency}
                    </p>
                    <p><strong>Tags:</strong> {formData.tags || "None added yet"}</p>
                    <p><strong>Application path:</strong> {formData.applicationUrl ? "AfriTalent and employer site" : "AfriTalent direct apply"}</p>
                  </div>
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
                    Keep communication on-platform, avoid vague salary bait, and make location plus visa expectations explicit. These patterns most strongly improve trust and reduce moderation holds.
                  </div>
                  {preview?.moderationRequired && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                      This draft is likely to trigger moderation review. Fix the highlighted credibility gaps first if you want a smoother publish path.
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4">
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
                    {loading ? "Creating..." : "Post job"}
                  </Button>
                )}
                <Link href={localizePath("/employer", locale)}>
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <EmployerJobPostingPreview preview={preview} loading={previewLoading} />

          <Card className="border-gray-200 bg-gray-50">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Moderation rules
              </p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">Inline trust guidance</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• Add compensation ranges where possible to improve credibility.</li>
                <li>• Clarify remote, onsite, or hybrid expectations and eligible countries.</li>
                <li>• Avoid off-platform contact instructions in the description.</li>
                <li>• Finish employer verification before scaling posting volume.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
