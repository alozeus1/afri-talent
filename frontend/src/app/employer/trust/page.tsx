"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { EmptyPanel, Eyebrow, PageSpinner, controlClass, labelClass } from "@/components/employer/employer-ui";
import { uploadVerificationFile } from "@/lib/trust-files";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { EXAMPLE } from "@/components/employer/locale-neutral";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";

const ARTIFACT_TYPES = ["BUSINESS_REGISTRATION", "DOMAIN_OWNERSHIP", "LINKEDIN_COMPANY"] as const;

type EmployerArtifactType = (typeof ARTIFACT_TYPES)[number];

function artifactTone(status: VerificationArtifactItem["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REJECTED") return "danger" as const;
  return "warning" as const;
}

export default function EmployerTrustPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tv, ts, fmt } = useEmployerI18n();

  const [dashboard, setDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  // "" = failed without a server message (rendered with a translated fallback).
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<"profile" | "artifact" | null>(null);
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

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const result = await trust.employerSummary();
      setDashboard(result);
      setWebsite(result.employer.website || "");
      setLinkedInCompanyUrl(result.linkedInCompanyUrl || "");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      void loadDashboard();
    }
  }, [user, loadDashboard]);

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
      return { tone: "info" as const, title: t("trust.stateLoadingTitle"), body: t("trust.stateLoadingBody") };
    }
    if (artifactSummary.rejected > 0) {
      return { tone: "danger" as const, title: t("trust.stateRejectedTitle"), body: t("trust.stateRejectedBody") };
    }
    if (!dashboard.trust.postingEligibility) {
      return { tone: "warning" as const, title: t("trust.stateLimitedTitle"), body: t("trust.stateLimitedBody") };
    }
    if (artifactSummary.pending > 0) {
      return { tone: "info" as const, title: t("trust.statePendingTitle"), body: t("trust.statePendingBody") };
    }
    if (dashboard.trust.requiresEnhancedVerification) {
      return { tone: "warning" as const, title: t("trust.stateEnhancedTitle"), body: t("trust.stateEnhancedBody") };
    }
    return { tone: "success" as const, title: t("trust.stateGoodTitle"), body: t("trust.stateGoodBody") };
  }, [artifactSummary.pending, artifactSummary.rejected, dashboard, t]);

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
      setPageSuccess("profile");
    } catch (error) {
      setPageError(error instanceof Error && error.message ? error.message : t("trust.errSaveProfile"));
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
      setPageSuccess("artifact");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPageError(
        msg.includes("S3_NOT_CONFIGURED") || msg.includes("not configured on this server")
          ? t("trust.errUploadUnavailable")
          : msg || t("trust.errSubmit"),
      );
    } finally {
      setSubmittingArtifact(false);
    }
  };

  if (isLoading || !user || loading) {
    return <PageSpinner />;
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <TrustStatusBanner
          tone="danger"
          title={t("trust.loadErrorTitle")}
          body={pageError || t("trust.loadErrorBody")}
          actions={
            <Button size="sm" onClick={() => void loadDashboard()}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const badge = ts(dashboard.trust.badge);
  const eligible = dashboard.trust.postingEligibility;
  const enhanced = dashboard.trust.requiresEnhancedVerification;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-line bg-surface p-8 shadow-card">
        <Eyebrow className="text-primary-text">{t("trust.eyebrow")}</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg text-balance sm:text-4xl">{t("trust.title")}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-fg-secondary sm:text-lg sm:leading-8">{t("trust.subtitle")}</p>
      </section>

      {pageError !== null && (
        <TrustStatusBanner tone="danger" title={t("trust.updateErrorTitle")} body={pageError || t("trust.errSubmit")} />
      )}

      {pageSuccess && (
        <TrustStatusBanner
          tone="success"
          title={t("trust.savedTitle")}
          body={pageSuccess === "profile" ? t("trust.savedProfile") : t("trust.savedArtifact")}
        />
      )}

      <TrustStatusBanner
        tone={trustState.tone}
        title={trustState.title}
        body={trustState.body}
        actions={
          <Link href={localizePath("/trust", locale)}>
            <Button size="sm" variant="outline">{t("common.openTrustCenter")}</Button>
          </Link>
        }
      />

      <TrustScoreCard
        title={dashboard.employer.companyName}
        subtitle={t("trust.scoreSubtitle")}
        badge={badge}
        authenticityScore={dashboard.trust.authenticityScore}
        riskScore={dashboard.trust.riskScore}
        riskLevel={dashboard.trust.riskLevel}
        actions={
          <div className="flex flex-wrap gap-2">
            {eligible ? (
              <Link href={localizePath("/employer/jobs/new", locale)}>
                <Button size="sm">{t("trust.postJob")}</Button>
              </Link>
            ) : (
              <Button size="sm" disabled>
                {t("trust.postJob")}
              </Button>
            )}
            <TrustExplainerModal
              title={t("trust.explainerTitle")}
              description={t("trust.explainerBody")}
              items={[
                {
                  title: t("trust.explainerBadge"),
                  description: t("trust.explainerBadgeBody", { badge }),
                  statusLabel: badge,
                  statusVariant: "success",
                },
                {
                  title: t("trust.explainerEligibility"),
                  description: eligible ? t("trust.explainerEligibleBody") : t("trust.explainerLimitedBody"),
                  statusLabel: eligible ? t("trust.enabled") : t("trust.limited"),
                  statusVariant: eligible ? "success" : "warning",
                },
                {
                  title: t("trust.explainerDepth"),
                  description: enhanced ? t("trust.explainerEnhancedBody") : t("trust.explainerOkBody"),
                  statusLabel: enhanced ? t("trust.enhancedReview") : t("trust.levelOk"),
                  statusVariant: enhanced ? "warning" : "info",
                },
              ]}
              triggerLabel={t("trust.whatCandidatesSee")}
            />
            <Link href={localizePath("/trust", locale)}>
              <Button size="sm" variant="outline">{t("trust.trustCenter")}</Button>
            </Link>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <h3 className="text-lg font-semibold text-fg">{t("trust.whatCandidatesSee")}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <TrustBadge label={badge} riskLevel={dashboard.trust.riskLevel} variant="success" />
                {dashboard.trust.verifiedDomain && (
                  <TrustBadge label={t("trust.verifiedDomain", { domain: dashboard.trust.verifiedDomain })} variant="info" />
                )}
                {enhanced && <TrustBadge label={t("trust.enhancedRequested")} riskLevel="MEDIUM" variant="warning" />}
              </div>
              <p className="mt-4 text-sm text-fg-secondary">
                {eligible ? t("trust.postingEnabled") : t("trust.postingBlocked")}
              </p>
              <p className="mt-3 text-sm text-fg-secondary">{t("trust.paidNote")}</p>
            </div>

            {dashboard.trust.warnings.length > 0 && (
              <div className="rounded-2xl border border-warning-line bg-warning-soft p-5">
                <h3 className="text-lg font-semibold text-warning">{t("trust.warningsTitle")}</h3>
                <ul className="mt-3 list-disc space-y-2 ps-5 text-sm text-fg-secondary">
                  {dashboard.trust.warnings.map((warning) => (
                    <li key={warning}>{ts(warning)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-fg">{t("trust.checklistTitle")}</h3>
            <TrustChecklist items={dashboard.trust.checklist.map((item) => ({ ...item, label: ts(item.label) }))} />
          </div>
        </div>
      </TrustScoreCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{t("trust.profileTitle")}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t("trust.profileBody")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <Input id="trustEmail" label={t("trust.companyEmail")} value={dashboard.employer.email} readOnly className="bg-surface-sunken" />
              <Input
                id="trustWebsite"
                type="url"
                label={t("trust.companyWebsite")}
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder={EXAMPLE.website}
              />
              <Input
                id="trustLinkedIn"
                type="url"
                label={t("trust.linkedInPage")}
                value={linkedInCompanyUrl}
                onChange={(event) => setLinkedInCompanyUrl(event.target.value)}
                placeholder={EXAMPLE.linkedInCompany}
              />
              <Button type="submit" isLoading={savingProfile} disabled={savingProfile}>
                {savingProfile ? t("common.saving") : t("trust.saveProfile")}
              </Button>
              <p className="text-xs leading-5 text-fg-muted">{t("trust.profileHint")}</p>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{t("trust.evidenceTitle")}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t("trust.evidenceBody")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleArtifactSubmit} className="space-y-4">
              <div>
                <label htmlFor="artifactType" className={labelClass}>
                  {t("trust.evidenceType")}
                </label>
                <select
                  id="artifactType"
                  value={artifactType}
                  onChange={(event) => setArtifactType(event.target.value as EmployerArtifactType)}
                  className={controlClass}
                >
                  {ARTIFACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {tv("artifact.type", type)}
                    </option>
                  ))}
                </select>
              </div>

              {artifactType !== "LINKEDIN_COMPANY" && (
                <div>
                  <label htmlFor="artifactFile" className={labelClass}>
                    {t("trust.uploadDocument")}
                  </label>
                  <input
                    id="artifactFile"
                    type="file"
                    aria-describedby="artifactFile-hint"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setArtifactFile(event.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-2.5 text-sm text-fg-secondary file:me-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg focus:outline-none focus:ring-2 focus:ring-focus"
                  />
                  <p id="artifactFile-hint" className="mt-1 text-xs text-fg-muted">{t("trust.fileHint")}</p>
                </div>
              )}

              <Input
                id="artifactUrl"
                type="url"
                label={artifactType === "LINKEDIN_COMPANY" ? t("trust.linkedInUrl") : t("trust.supportingUrl")}
                value={artifactType === "LINKEDIN_COMPANY" ? linkedInCompanyUrl : artifactUrl}
                onChange={(event) =>
                  artifactType === "LINKEDIN_COMPANY"
                    ? setLinkedInCompanyUrl(event.target.value)
                    : setArtifactUrl(event.target.value)
                }
                placeholder={
                  artifactType === "LINKEDIN_COMPANY"
                    ? EXAMPLE.linkedInCompany
                    : t("trust.supportingUrlPlaceholder")
                }
              />

              <Button type="submit" isLoading={submittingArtifact} disabled={submittingArtifact}>
                {submittingArtifact ? t("trust.submitting") : t("trust.submitForReview")}
              </Button>
              <p className="text-xs leading-5 text-fg-muted">{t("trust.evidenceHint")}</p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{t("trust.submittedTitle")}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.artifacts.length === 0 ? (
              <EmptyPanel title={t("trust.noEvidenceTitle")} description={t("trust.noEvidenceBody")} className="py-8" />
            ) : (
              dashboard.artifacts.map((artifact: VerificationArtifactItem) => (
                <div key={artifact.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{tv("artifact.type", artifact.type)}</p>
                    <TrustBadge label={tv("artifact.status", artifact.status)} variant={artifactTone(artifact.status)} />
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{t("trust.submittedOn", { date: fmt.date(artifact.submittedAt) })}</p>
                  <p className="mt-2 text-sm text-fg-secondary">{tv("artifact.summary", artifact.status)}</p>
                  {artifact.fileName && (
                    <p className="mt-2 break-all text-sm text-fg-secondary">{t("trust.file", { name: artifact.fileName })}</p>
                  )}
                  {artifact.externalUrl && (
                    <a
                      href={artifact.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-sm font-medium text-primary-text hover:underline"
                    >
                      {t("trust.viewLink")}
                    </a>
                  )}
                  {artifact.reviewerNotes && (
                    <p className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg-secondary">
                      {t("trust.reviewerNotes", { notes: artifact.reviewerNotes })}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{t("trust.recentJobsTitle")}</h2>
            <p className="mt-1 text-sm text-fg-secondary">{t("trust.recentJobsBody")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.recentJobs.length === 0 ? (
              <EmptyPanel title={t("trust.noJobsTitle")} description={t("trust.noJobsBody")} className="py-8" />
            ) : (
              dashboard.recentJobs.map((job) => (
                <div key={job.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{job.title}</p>
                      <p className="text-sm text-fg-muted">{t("dash.createdOn", { date: fmt.date(job.createdAt) })}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge
                        label={tv("status.job", job.status)}
                        variant={job.status === "PUBLISHED" ? "success" : job.status === "REJECTED" ? "danger" : "warning"}
                      />
                      <TrustBadge label={t("trust.riskBadge", { level: tv("risk", job.riskLevel) })} riskLevel={job.riskLevel} />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-fg-secondary">
                    {job.status === "PUBLISHED"
                      ? t("trust.jobPublished")
                      : job.status === "REJECTED"
                        ? t("trust.jobRejected")
                        : t("trust.jobPending")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title={t("trust.supportTitle")}
        description={t("trust.supportBody")}
      />
    </div>
  );
}
