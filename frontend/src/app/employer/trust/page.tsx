"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { EmployerTrustDashboard, trust, VerificationArtifactItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustChecklist } from "@/components/trust/trust-checklist";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustScoreCard } from "@/components/trust/trust-score-card";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { uploadVerificationFile } from "@/lib/trust-files";
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

const artifactTypes = [
  { value: "BUSINESS_REGISTRATION", label: "Business registration document" },
  { value: "DOMAIN_OWNERSHIP", label: "Domain ownership proof" },
  { value: "LINKEDIN_COMPANY", label: "LinkedIn company page" },
] as const;

type EmployerArtifactType = (typeof artifactTypes)[number]["value"];

function artifactStatusCopy(status: VerificationArtifactItem["status"]) {
  if (status === "APPROVED") {
    return {
      tone: "success" as const,
      summary: "Approved and contributing to your employer trust profile.",
    };
  }

  if (status === "REJECTED") {
    return {
      tone: "danger" as const,
      summary: "Needs updated evidence before it can strengthen your trust standing.",
    };
  }

  if (status === "NEEDS_MORE_INFO") {
    return {
      tone: "warning" as const,
      summary: "A reviewer needs more detail before this signal can be approved.",
    };
  }

  return {
    tone: "warning" as const,
    summary: "Submitted and waiting for trust review.",
  };
}

export default function EmployerTrustPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [dashboard, setDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submittingArtifact, setSubmittingArtifact] = useState(false);

  const [website, setWebsite] = useState("");
  const [linkedInCompanyUrl, setLinkedInCompanyUrl] = useState("");
  const [artifactType, setArtifactType] = useState<EmployerArtifactType>("BUSINESS_REGISTRATION");
  const [artifactFile, setArtifactFile] = useState<File | null>(null);
  const [artifactUrl, setArtifactUrl] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, locale, router, user]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const result = await trust.employerSummary();
      setDashboard(result);
      setWebsite(result.employer.website || "");
      setLinkedInCompanyUrl(result.linkedInCompanyUrl || "");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load employer trust data.");
    } finally {
      setLoading(false);
    }
  };

  const artifactPlaceholder = useMemo(() => {
    if (artifactType === "LINKEDIN_COMPANY") {
      return "https://www.linkedin.com/company/your-company";
    }
    return "Optional supporting URL";
  }, [artifactType]);

  const artifactSummary = useMemo(() => {
    return (dashboard?.artifacts || []).reduce(
      (summary, artifact) => {
        if (artifact.status === "APPROVED") summary.approved += 1;
        if (artifact.status === "REJECTED") summary.rejected += 1;
        if (artifact.status === "PENDING" || artifact.status === "NEEDS_MORE_INFO") summary.pending += 1;
        return summary;
      },
      { approved: 0, rejected: 0, pending: 0 },
    );
  }, [dashboard?.artifacts]);

  const trustState = useMemo(() => {
    if (!dashboard) {
      return {
        tone: "info" as const,
        title: "Loading trust state",
        body: "We are preparing your current employer verification summary.",
      };
    }

    if (artifactSummary.rejected > 0) {
      return {
        tone: "danger" as const,
        title: "Some verification evidence needs attention",
        body: "At least one submission was rejected or needs more detail. Update the evidence and reviewer notes so your public trust state can improve.",
      };
    }

    if (!dashboard.trust.postingEligibility) {
      return {
        tone: "warning" as const,
        title: "Public job posting is still limited",
        body: "Complete the minimum trust checks first. This protects candidates from low-credibility employers and protects your jobs from avoidable moderation delays.",
      };
    }

    if (artifactSummary.pending > 0) {
      return {
        tone: "info" as const,
        title: "Review in progress",
        body: "Your latest employer evidence is being reviewed. We keep your current trust status visible while new evidence is assessed.",
      };
    }

    if (dashboard.trust.requiresEnhancedVerification) {
      return {
        tone: "warning" as const,
        title: "Enhanced verification is required",
        body: "High-volume or higher-risk employers need stronger proof before they can keep scaling. This is a precaution, not a penalty.",
      };
    }

    return {
      tone: "success" as const,
      title: "Your trust profile is in good standing",
      body: "Candidates can see that your company has passed meaningful checks. Keep your website, domain, and evidence current to stay in the highest-confidence tier.",
    };
  }, [artifactSummary.pending, artifactSummary.rejected, dashboard]);

  const handleProfileSave = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      await trust.updateEmployerProfile({
        website: website.trim() || undefined,
        linkedInCompanyUrl: linkedInCompanyUrl.trim() || undefined,
      });
      await loadDashboard();
      setPageSuccess("Trust profile details updated.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save employer trust profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleArtifactSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingArtifact(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      let uploaded: { fileKey?: string; fileName?: string } = {};
      if (artifactFile) {
        uploaded = await uploadVerificationFile(artifactFile, "employer-verification");
      }

      const submissionUrl =
        artifactType === "LINKEDIN_COMPANY"
          ? linkedInCompanyUrl.trim() || artifactUrl.trim()
          : artifactUrl.trim();

      await trust.submitEmployerArtifact({
        type: artifactType,
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        externalUrl: submissionUrl || undefined,
      });
      setArtifactFile(null);
      setArtifactUrl("");
      await loadDashboard();
      setPageSuccess("Verification evidence submitted for review.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPageError(
        msg.includes("S3_NOT_CONFIGURED") || msg.includes("not configured on this server")
          ? "Document upload is not available in this environment. Contact your administrator."
          : msg || "Failed to submit verification evidence.",
      );
    } finally {
      setSubmittingArtifact(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (loading || !dashboard) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 mb-3">
          Employer Trust
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Build a hiring presence candidates can trust on first glance</h1>
        <p className="max-w-3xl text-lg leading-8 text-gray-600">
          AfriTalent uses domain checks, company evidence, moderation history, and manual review before granting higher employer trust states. Strong trust signals improve apply quality and reduce review friction.
        </p>
      </section>

      {pageError && (
        <TrustStatusBanner tone="danger" title="We couldn't update your trust profile" body={pageError} />
      )}

      {pageSuccess && (
        <TrustStatusBanner tone="success" title="Trust update saved" body={pageSuccess} />
      )}

      <TrustStatusBanner
        tone={trustState.tone}
        title={trustState.title}
        body={trustState.body}
        actions={
          <Link href={localizePath("/trust", locale)}>
            <Button size="sm" variant="outline">Open trust center</Button>
          </Link>
        }
      />

      <TrustScoreCard
        title={dashboard.employer.companyName}
        subtitle="AfriTalent never shows an employer trust badge based on payment alone. Domain alignment, company evidence, moderation history, and review outcomes all contribute."
        badge={dashboard.trust.badge}
        authenticityScore={dashboard.trust.authenticityScore}
        riskScore={dashboard.trust.riskScore}
        riskLevel={dashboard.trust.riskLevel}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={localizePath("/employer/jobs/new", locale)}>
              <Button size="sm" disabled={!dashboard.trust.postingEligibility}>
                Post a job
              </Button>
            </Link>
            <TrustExplainerModal
              title="What candidates see when they evaluate your company"
              description="Candidates should understand why your employer account is credible before they apply or reply."
              items={[
                {
                  title: "Employer badge",
                  description: `${dashboard.trust.badge} reflects the strongest trust tier your company currently qualifies for.`,
                  statusLabel: dashboard.trust.badge,
                  statusVariant: "success",
                },
                {
                  title: "Posting eligibility",
                  description: dashboard.trust.postingEligibility
                    ? "Public job posting is enabled because the minimum trust checks passed."
                    : "Public job posting is still limited until more trust checks pass.",
                  statusLabel: dashboard.trust.postingEligibility ? "Enabled" : "Limited",
                  statusVariant: dashboard.trust.postingEligibility ? "success" : "warning",
                },
                {
                  title: "Verification depth",
                  description: dashboard.trust.requiresEnhancedVerification
                    ? "Your account now needs stronger verification due to scale or risk context."
                    : "Your current verification depth is appropriate for your current activity.",
                  statusLabel: dashboard.trust.requiresEnhancedVerification ? "Enhanced review" : "Current level okay",
                  statusVariant: dashboard.trust.requiresEnhancedVerification ? "warning" : "info",
                },
              ]}
              triggerLabel="What candidates see"
            />
            <Link href={localizePath("/trust", locale)}>
              <Button size="sm" variant="outline">Trust center</Button>
            </Link>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/80 bg-white/80 p-5">
              <h3 className="text-lg font-semibold text-gray-900">What candidates see</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <TrustBadge label={dashboard.trust.badge} riskLevel={dashboard.trust.riskLevel} variant="success" />
                {dashboard.trust.verifiedDomain && (
                  <TrustBadge label={`Verified domain: ${dashboard.trust.verifiedDomain}`} variant="info" />
                )}
                {dashboard.trust.requiresEnhancedVerification && (
                  <TrustBadge label="Enhanced verification requested" riskLevel="MEDIUM" variant="warning" />
                )}
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Public job posting is{" "}
                <span className="font-semibold text-gray-900">
                  {dashboard.trust.postingEligibility ? "enabled" : "blocked until minimum trust checks pass"}.
                </span>
              </p>
              <p className="mt-3 text-sm text-gray-600">
                Paid features can improve distribution and workflow depth, but they do not create trust badges without real checks.
              </p>
            </div>

            {dashboard.trust.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="text-lg font-semibold text-amber-900">Trust warnings</h3>
                <ul className="mt-3 space-y-2 text-sm text-amber-900">
                  {dashboard.trust.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Verification checklist</h3>
            <TrustChecklist items={dashboard.trust.checklist} />
          </div>
        </div>
      </TrustScoreCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Company trust profile</h2>
            <p className="text-sm text-gray-600">
              Keep your website and LinkedIn company page aligned with your employer account. Domain mismatches increase risk.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <Input
                label="Company email"
                value={dashboard.employer.email}
                readOnly
                className="bg-gray-50"
              />
              <Input
                label="Company website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://company.com"
              />
              <Input
                label="LinkedIn company page"
                value={linkedInCompanyUrl}
                onChange={(event) => setLinkedInCompanyUrl(event.target.value)}
                placeholder="https://www.linkedin.com/company/your-company"
              />
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save trust profile"}
              </Button>
              <p className="text-xs leading-5 text-gray-500">
                Keep company email, website, and LinkedIn details aligned. Mismatches slow approvals and can create caution labels.
              </p>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submit verification evidence</h2>
            <p className="text-sm text-gray-600">
              Upload business registration documents, domain ownership proof, or a LinkedIn company page for review. Reviewer notes will appear below if we need more information.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleArtifactSubmit} className="space-y-4">
              <div>
                <label htmlFor="artifactType" className="block text-sm font-medium text-gray-700 mb-1">
                  Evidence type
                </label>
                <select
                  id="artifactType"
                  value={artifactType}
                  onChange={(event) => setArtifactType(event.target.value as EmployerArtifactType)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {artifactTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {artifactType !== "LINKEDIN_COMPANY" && (
                <div>
                  <label htmlFor="artifactFile" className="block text-sm font-medium text-gray-700 mb-1">
                    Upload document
                  </label>
                  <input
                    id="artifactFile"
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setArtifactFile(event.target.files?.[0] || null)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                  />
                </div>
              )}

              <Input
                label={artifactType === "LINKEDIN_COMPANY" ? "LinkedIn company page URL" : "Supporting URL"}
                value={artifactType === "LINKEDIN_COMPANY" ? linkedInCompanyUrl : artifactUrl}
                onChange={(event) =>
                  artifactType === "LINKEDIN_COMPANY"
                    ? setLinkedInCompanyUrl(event.target.value)
                    : setArtifactUrl(event.target.value)
                }
                placeholder={artifactPlaceholder}
              />

              <Button type="submit" disabled={submittingArtifact}>
                {submittingArtifact ? "Submitting..." : "Submit for review"}
              </Button>
              <p className="text-xs leading-5 text-gray-500">
                Clear, recent documents reduce review time. If your account is scaling quickly, we may ask for stronger evidence before broad posting continues.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submitted evidence</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.artifacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                No verification evidence has been submitted yet. Start with your business registration or domain proof so candidates see a stronger credibility trail.
              </div>
            ) : (
              dashboard.artifacts.map((artifact: VerificationArtifactItem) => (
                <div key={artifact.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{humanizeTrustValue(artifact.type)}</p>
                    <TrustBadge label={humanizeTrustValue(artifact.status)} variant={artifactStatusCopy(artifact.status).tone} />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Submitted {new Date(artifact.submittedAt).toLocaleDateString()}
                  </p>
                  <p className="mt-2 text-sm text-gray-700">{artifactStatusCopy(artifact.status).summary}</p>
                  {artifact.fileName && (
                    <p className="mt-2 text-sm text-gray-700">File: {artifact.fileName}</p>
                  )}
                  {artifact.externalUrl && (
                    <a
                      href={artifact.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-sm text-emerald-700 hover:text-emerald-800"
                    >
                      View supporting link
                    </a>
                  )}
                  {artifact.reviewerNotes && (
                    <p className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                      Reviewer notes: {artifact.reviewerNotes}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Recent jobs and moderation</h2>
            <p className="text-sm text-gray-600">
              We show moderation context here so you can see how trust affects publishing and candidate-facing visibility.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.recentJobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                No recent jobs yet. Once your minimum trust threshold passes, you can publish roles from the employer dashboard and see moderation outcomes here.
              </div>
            ) : (
              dashboard.recentJobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{job.title}</p>
                      <p className="text-sm text-gray-500">
                        Created {new Date(job.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge label={humanizeTrustValue(job.status)} variant={job.status === "PUBLISHED" ? "success" : job.status === "REJECTED" ? "danger" : "warning"} />
                      <TrustBadge label={`${job.riskLevel} risk`} riskLevel={job.riskLevel} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    {job.status === "PUBLISHED"
                      ? "This role passed moderation and is visible to candidates."
                      : job.status === "REJECTED"
                        ? "This role was blocked from publishing. Review your trust guidance before reposting."
                        : "This role is still being reviewed or limited before broader publication."}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title="Need trust support or a manual follow-up?"
        description="If your employer verification feels stuck, a moderation result looks wrong, or a suspicious actor is targeting your team, contact support or send a trust report."
      />
    </div>
  );
}
