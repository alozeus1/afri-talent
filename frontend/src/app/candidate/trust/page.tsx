"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  CandidatePartnerMarkerItem,
  CandidateTrustDashboard,
  CandidateVerifiedSkillItem,
  trust,
  VerificationArtifactItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustChecklist } from "@/components/trust/trust-checklist";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustScoreCard } from "@/components/trust/trust-score-card";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateSpinner,
  URL_PLACEHOLDERS,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { uploadVerificationFile } from "@/lib/trust-files";
import { localizePath, useLocale } from "@/lib/i18n/client";
import {
  enumLabel,
  useCandidateFormatters,
  useCandidateT,
  type CandidateMessageKey,
  type CandidateVars,
} from "@/lib/i18n/candidate-messages";

const ARTIFACT_TYPES = ["IDENTITY_DOCUMENT", "CERTIFICATION", "EMPLOYMENT_PROOF"] as const;
type CandidateArtifactType = (typeof ARTIFACT_TYPES)[number];
type CandidateSkillMethod = "CERTIFICATE" | "PORTFOLIO" | "ASSESSMENT";
const SKILL_METHODS: CandidateSkillMethod[] = ["ASSESSMENT", "CERTIFICATE", "PORTFOLIO"];

type Feedback = { tone: "success" | "danger"; key: CandidateMessageKey; vars?: CandidateVars };

function artifactTone(status: VerificationArtifactItem["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REJECTED") return "danger" as const;
  return "warning" as const;
}

function signalVariant(status: string) {
  return status === "verified" ? ("success" as const) : status === "needs_attention" ? ("warning" as const) : ("info" as const);
}

function isUploadUnavailable(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("S3_NOT_CONFIGURED") || msg.includes("not configured on this server");
}

export default function CandidateTrustPage() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [dashboard, setDashboard] = useState<CandidateTrustDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [artifactType, setArtifactType] = useState<CandidateArtifactType>("IDENTITY_DOCUMENT");
  const [artifactFile, setArtifactFile] = useState<File | null>(null);
  const [artifactUrl, setArtifactUrl] = useState("");
  const [submittingArtifact, setSubmittingArtifact] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [skillMethod, setSkillMethod] = useState<CandidateSkillMethod>("ASSESSMENT");
  const [skillEvidenceLabel, setSkillEvidenceLabel] = useState("");
  const [skillEvidenceFile, setSkillEvidenceFile] = useState<File | null>(null);
  const [skillEvidenceUrl, setSkillEvidenceUrl] = useState("");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [submittingSkill, setSubmittingSkill] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, locale, router, user]);

  const loadDashboard = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await trust.candidateSummary();
      setDashboard(result);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") loadDashboard();
  }, [user, loadDashboard]);

  const linkedSignalCount = useMemo(() => {
    if (!dashboard?.profile) return 0;
    return [dashboard.profile.linkedinUrl, dashboard.profile.githubUrl, dashboard.profile.portfolioUrl].filter(Boolean)
      .length;
  }, [dashboard?.profile]);

  const completedAssessments = useMemo(
    () => (dashboard?.assessments || []).filter((assessment) => assessment.status === "COMPLETED"),
    [dashboard?.assessments],
  );

  const artifactSummary = useMemo(
    () =>
      (dashboard?.artifacts || []).reduce(
        (summary, artifact) => {
          if (artifact.status === "APPROVED") summary.approved += 1;
          if (artifact.status === "REJECTED") summary.rejected += 1;
          if (artifact.status === "PENDING" || artifact.status === "NEEDS_MORE_INFO") summary.pending += 1;
          return summary;
        },
        { approved: 0, rejected: 0, pending: 0 },
      ),
    [dashboard?.artifacts],
  );

  const trustState = useMemo(() => {
    if (!dashboard) return { tone: "info" as const, id: "loading" };
    if (artifactSummary.rejected > 0) return { tone: "danger" as const, id: "rejected" };
    if (artifactSummary.pending > 0) return { tone: "info" as const, id: "pending" };
    if (!dashboard.trust.premiumFilterEligible) return { tone: "warning" as const, id: "building" };
    return { tone: "success" as const, id: "ready" };
  }, [artifactSummary.pending, artifactSummary.rejected, dashboard]);

  const handleRequestOtp = async () => {
    setRequestingOtp(true);
    setFeedback(null);
    try {
      const result = await trust.requestPhoneOtp(phoneNumber);
      setOtpPreview(result.previewCode || null);
      setOtpExpiresAt(result.expiresAt);
      setFeedback({ tone: "success", key: "trust.phone.sent" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setFeedback({
        tone: "danger",
        key:
          msg === "sms_provider_unconfigured" || msg.includes("SMS_DISABLED")
            ? "trust.phone.unavailable"
            : "trust.phone.requestFailed",
      });
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setVerifyingOtp(true);
    setFeedback(null);
    try {
      await trust.verifyPhoneOtp(phoneNumber, otpCode);
      setOtpCode("");
      setOtpPreview(null);
      setOtpExpiresAt(null);
      await loadDashboard();
      setFeedback({ tone: "success", key: "trust.phone.verified" });
    } catch {
      setFeedback({ tone: "danger", key: "trust.phone.verifyFailed" });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleArtifactSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingArtifact(true);
    setFeedback(null);
    try {
      let uploaded: { fileKey?: string; fileName?: string } = {};
      if (artifactFile) {
        uploaded = await uploadVerificationFile(artifactFile, "candidate-verification");
      }
      await trust.submitCandidateArtifact({
        type: artifactType,
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        externalUrl: artifactUrl.trim() || undefined,
      });
      setArtifactFile(null);
      setArtifactUrl("");
      await loadDashboard();
      setFeedback({ tone: "success", key: "trust.evidence.submitted" });
    } catch (error) {
      setFeedback({
        tone: "danger",
        key: isUploadUnavailable(error) ? "trust.evidence.uploadUnavailable" : "trust.evidence.failed",
      });
    } finally {
      setSubmittingArtifact(false);
    }
  };

  const handleSkillVerificationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingSkill(true);
    setFeedback(null);
    try {
      let uploaded: { fileKey?: string; fileName?: string } = {};
      if (skillEvidenceFile) {
        uploaded = await uploadVerificationFile(skillEvidenceFile, "candidate-verification");
      }
      await trust.submitCandidateSkillVerification({
        skillName,
        method: skillMethod,
        evidenceLabel: skillEvidenceLabel.trim() || undefined,
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        externalUrl: skillEvidenceUrl.trim() || undefined,
        assessmentId: skillMethod === "ASSESSMENT" ? selectedAssessmentId || undefined : undefined,
      });
      setSkillName("");
      setSkillEvidenceLabel("");
      setSkillEvidenceFile(null);
      setSkillEvidenceUrl("");
      setSelectedAssessmentId("");
      await loadDashboard();
      setFeedback({ tone: "success", key: skillMethod === "ASSESSMENT" ? "trust.skills.processed" : "trust.skills.submitted" });
    } catch (error) {
      setFeedback({
        tone: "danger",
        key: isUploadUnavailable(error) ? "trust.evidence.uploadUnavailable" : "trust.skills.failed",
      });
    } finally {
      setSubmittingSkill(false);
    }
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <LoadingState lines={8} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <CandidateLoadError
          error={loadError}
          subject={t("ui.subject.trust")}
          onRetry={() => {
            setLoading(true);
            loadDashboard();
          }}
        />
      </div>
    );
  }

  const emptyBox = "rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-4 py-5 text-sm text-fg-secondary";
  const linkRow =
    "flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-sm font-medium text-primary-text hover:border-line-strong hover:underline";

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div>
        <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">{t("trust.eyebrow")}</p>
          <h1 className="mb-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t("trust.title")}</h1>
          <p className="max-w-3xl text-base leading-7 text-fg-secondary sm:text-lg sm:leading-8">{t("trust.subtitle")}</p>
        </section>
      </div>

      {feedback && (
        <TrustStatusBanner
          tone={feedback.tone}
          title={feedback.tone === "danger" ? t("trust.err.title") : t("trust.ok.title")}
          body={t(feedback.key, feedback.vars)}
        />
      )}

      <TrustStatusBanner
        tone={trustState.tone}
        title={t(`trust.state.${trustState.id}.title` as CandidateMessageKey)}
        body={t(`trust.state.${trustState.id}.body` as CandidateMessageKey)}
        actions={
          <Link href={localizePath("/trust", locale)}>
            <Button size="sm" variant="outline">
              {t("trust.openCenter")}
            </Button>
          </Link>
        }
      />

      <TrustScoreCard
        title={dashboard.profile?.headline || user.name}
        subtitle={t("trust.scoreSubtitle")}
        badge={dashboard.trust.badge}
        authenticityScore={dashboard.trust.authenticityScore}
        riskScore={dashboard.trust.riskScore}
        riskLevel={dashboard.trust.riskLevel}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={localizePath("/candidate/profile", locale)}>
              <Button size="sm">{t("trust.updateProfile")}</Button>
            </Link>
            <TrustExplainerModal
              title={t("trust.explainer.title")}
              description={t("trust.explainer.body")}
              items={dashboard.trust.explainability.map((signal) => ({
                title: signal.label,
                description: signal.detail,
                statusLabel: enumLabel(t, "tv", signal.status),
                statusVariant: signalVariant(signal.status),
              }))}
              triggerLabel={t("trust.explainer.trigger")}
            />
            <Link href={localizePath("/trust", locale)}>
              <Button size="sm" variant="outline">
                {t("trust.trustCenter")}
              </Button>
            </Link>
          </div>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-surface-sunken p-5">
              <h3 className="text-lg font-semibold text-fg">{t("trust.signals.title")}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <TrustBadge label={dashboard.trust.badge} riskLevel={dashboard.trust.riskLevel} variant="success" />
                {dashboard.trust.maskedPhone && (
                  <TrustBadge label={t("trust.signals.phone", { phone: dashboard.trust.maskedPhone })} variant="info" />
                )}
                {dashboard.trust.premiumFilterEligible && <TrustBadge label={t("trust.signals.filters")} variant="success" />}
                {dashboard.trust.verifiedSkillCount > 0 && (
                  <TrustBadge label={t("trust.signals.skills", { count: dashboard.trust.verifiedSkillCount })} variant="success" />
                )}
                {dashboard.trust.partnerSignalCount > 0 && (
                  <TrustBadge label={t("trust.signals.partners", { count: dashboard.trust.partnerSignalCount })} variant="info" />
                )}
                {dashboard.trust.assessmentBacked && <TrustBadge label={t("trust.signals.assessment")} variant="success" />}
                {dashboard.trust.fullyCompletedProfile && <TrustBadge label={t("trust.signals.complete")} variant="success" />}
              </div>
              <p className="mt-4 text-sm text-fg-secondary">
                {t("trust.signals.summary", {
                  percent: dashboard.profile?.profileCompleteness ?? 0,
                  count: linkedSignalCount,
                })}
              </p>
              <p className="mt-3 text-sm text-fg-secondary">{t("trust.signals.note")}</p>
            </div>

            {dashboard.trust.warnings.length > 0 && (
              <div className="rounded-2xl border border-warning-line bg-warning-soft p-5">
                <h3 className="text-lg font-semibold text-fg">{t("trust.warnings")}</h3>
                <ul className="mt-3 list-disc space-y-2 ps-5 text-sm text-fg-secondary">
                  {dashboard.trust.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-4 text-lg font-semibold text-fg">{t("trust.checklist")}</h3>
            <TrustChecklist items={dashboard.trust.checklist} />
          </div>
        </div>
      </TrustScoreCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.trust.explainability.map((signal) => (
          <Card key={signal.key}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">{signal.label}</p>
                  <p className="mt-2 text-sm text-fg-secondary">{signal.detail}</p>
                </div>
                <TrustBadge label={enumLabel(t, "tv", signal.status)} variant={signalVariant(signal.status)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("trust.phone.title")}</h2>
            <p className="text-sm text-fg-secondary">{t("trust.phone.body")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.trust.maskedPhone ? (
              <TrustStatusBanner
                tone="success"
                title={t("trust.phone.done.title")}
                body={t("trust.phone.done.body", { phone: dashboard.trust.maskedPhone })}
              />
            ) : (
              <TrustStatusBanner tone="info" title={t("trust.phone.tip.title")} body={t("trust.phone.tip.body")} />
            )}

            <Input
              id="trust-phone"
              label={t("trust.phone.number")}
              type="tel"
              autoComplete="tel"
              dir="ltr"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+2348012345678"
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={handleRequestOtp} disabled={requestingOtp || !phoneNumber.trim()}>
                {requestingOtp ? t("trust.phone.creating") : t("trust.phone.send")}
              </Button>
              {otpExpiresAt && <p className="text-sm text-fg-muted">{t("trust.phone.expires", { time: fmt.time(otpExpiresAt) })}</p>}
            </div>

            {otpPreview && (
              <div className="rounded-2xl border border-info-line bg-info-soft px-4 py-3 text-sm text-fg-secondary">
                {t("trust.phone.preview")} <span className="font-semibold text-fg">{otpPreview}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                id="trust-otp"
                label={t("trust.phone.code")}
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
              />
              <Button type="submit" disabled={verifyingOtp || !otpCode.trim()}>
                {verifyingOtp ? t("trust.phone.verifying") : t("trust.phone.verify")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("trust.evidence.title")}</h2>
            <p className="text-sm text-fg-secondary">{t("trust.evidence.body")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleArtifactSubmit} className="space-y-4">
              <div>
                <label htmlFor="artifactType" className={candidateLabelClass}>
                  {t("trust.evidence.type")}
                </label>
                <select
                  id="artifactType"
                  value={artifactType}
                  onChange={(event) => setArtifactType(event.target.value as CandidateArtifactType)}
                  className={candidateFieldClass}
                >
                  {ARTIFACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {enumLabel(t, "tv", type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="artifactFile" className={candidateLabelClass}>
                  {t("trust.evidence.upload")}
                </label>
                <input
                  id="artifactFile"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setArtifactFile(event.target.files?.[0] || null)}
                  className={`${candidateFieldClass} file:me-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-fg`}
                />
              </div>

              <Input
                id="artifactUrl"
                label={t("trust.evidence.url")}
                type="url"
                value={artifactUrl}
                onChange={(event) => setArtifactUrl(event.target.value)}
                placeholder={t("trust.evidence.urlPlaceholder")}
              />

              <Button type="submit" disabled={submittingArtifact}>
                {submittingArtifact ? t("trust.evidence.submitting") : t("trust.evidence.submit")}
              </Button>
              <p className="text-xs leading-5 text-fg-muted">{t("trust.evidence.note")}</p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("trust.skills.title")}</h2>
            <p className="text-sm text-fg-secondary">{t("trust.skills.body")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSkillVerificationSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="trust-skill"
                  label={t("trust.skills.skill")}
                  value={skillName}
                  onChange={(event) => setSkillName(event.target.value)}
                  placeholder={t("trust.skills.skillPlaceholder")}
                />
                <div>
                  <label htmlFor="skillMethod" className={candidateLabelClass}>
                    {t("trust.skills.method")}
                  </label>
                  <select
                    id="skillMethod"
                    value={skillMethod}
                    onChange={(event) => setSkillMethod(event.target.value as CandidateSkillMethod)}
                    className={candidateFieldClass}
                  >
                    {SKILL_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {enumLabel(t, "tv", method)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Input
                id="trust-evidence-label"
                label={t("trust.skills.evidenceLabel")}
                value={skillEvidenceLabel}
                onChange={(event) => setSkillEvidenceLabel(event.target.value)}
                placeholder={t("trust.skills.evidencePlaceholder")}
              />

              {skillMethod === "ASSESSMENT" && (
                <div>
                  <label htmlFor="selectedAssessmentId" className={candidateLabelClass}>
                    {t("trust.skills.assessment")}
                  </label>
                  <select
                    id="selectedAssessmentId"
                    value={selectedAssessmentId}
                    onChange={(event) => setSelectedAssessmentId(event.target.value)}
                    className={candidateFieldClass}
                  >
                    <option value="">{t("trust.skills.chooseAssessment")}</option>
                    {completedAssessments.map((assessment) => (
                      <option key={assessment.id} value={assessment.id}>
                        {assessment.skillName} {assessment.score != null ? `(${assessment.score})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-fg-muted">{t("trust.skills.assessmentNote")}</p>
                </div>
              )}

              {skillMethod !== "ASSESSMENT" && (
                <>
                  {skillMethod === "CERTIFICATE" && (
                    <div>
                      <label htmlFor="skillEvidenceFile" className={candidateLabelClass}>
                        {t("trust.skills.uploadCert")}
                      </label>
                      <input
                        id="skillEvidenceFile"
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setSkillEvidenceFile(event.target.files?.[0] || null)}
                        className={`${candidateFieldClass} file:me-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-fg`}
                      />
                    </div>
                  )}
                  <Input
                    id="trust-skill-url"
                    type="url"
                    label={skillMethod === "CERTIFICATE" ? t("trust.skills.credentialUrl") : t("trust.skills.portfolioUrl")}
                    value={skillEvidenceUrl}
                    onChange={(event) => setSkillEvidenceUrl(event.target.value)}
                    placeholder={URL_PLACEHOLDERS.generic}
                  />
                </>
              )}

              <Button
                type="submit"
                disabled={submittingSkill || !skillName.trim() || (skillMethod === "ASSESSMENT" && !selectedAssessmentId)}
              >
                {submittingSkill ? t("trust.evidence.submitting") : t("trust.skills.submit")}
              </Button>
              <p className="text-xs leading-5 text-fg-muted">{t("trust.skills.note")}</p>
            </form>

            <div className="mt-6 space-y-3">
              {dashboard.skillVerifications.length === 0 ? (
                <div className={emptyBox}>{t("trust.skills.empty")}</div>
              ) : (
                dashboard.skillVerifications.map((skill: CandidateVerifiedSkillItem) => (
                  <div key={skill.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-fg">{skill.skillName}</p>
                      <TrustBadge
                        label={enumLabel(t, "tv", skill.status)}
                        variant={skill.status === "VERIFIED" ? "success" : skill.status === "REJECTED" ? "danger" : "warning"}
                      />
                      <TrustBadge label={enumLabel(t, "tv", skill.method)} variant="info" />
                    </div>
                    {(skill.evidenceLabel || skill.confidenceNote) && (
                      <p className="mt-2 text-sm text-fg-secondary">{skill.evidenceLabel || skill.confidenceNote}</p>
                    )}
                    {skill.partner && (
                      <p className="mt-2 text-xs text-fg-muted">{t("trust.skills.via", { partner: skill.partner.name })}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("trust.partners.title")}</h2>
            <p className="text-sm text-fg-secondary">{t("trust.partners.body")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.partnerMarkers.length === 0 ? (
              <div className={emptyBox}>{t("trust.partners.empty")}</div>
            ) : (
              dashboard.partnerMarkers.map((marker: CandidatePartnerMarkerItem) => (
                <div key={marker.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{marker.label}</p>
                    <TrustBadge label={enumLabel(t, "tv", marker.status)} variant={marker.status === "ACTIVE" ? "success" : "warning"} />
                  </div>
                  <p className="mt-2 text-sm text-fg-secondary">
                    {marker.description || t("trust.partners.issued", { partner: marker.partner.name })}
                  </p>
                  <p className="mt-2 text-xs text-fg-muted">
                    {marker.partner.name} · {enumLabel(t, "tv", marker.partner.organizationType)}
                  </p>
                </div>
              ))
            )}

            <div className="rounded-2xl border border-info-line bg-info-soft p-4">
              <p className="text-sm font-semibold text-fg">{t("trust.history.title")}</p>
              <div className="mt-3 space-y-2">
                {dashboard.assessments.length === 0 ? (
                  <p className="text-sm text-fg-secondary">{t("trust.history.empty")}</p>
                ) : (
                  dashboard.assessments.slice(0, 5).map((assessment) => (
                    <div key={assessment.id} className="flex items-center justify-between gap-4 rounded-xl bg-surface px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-fg">{assessment.skillName}</p>
                        <p className="text-xs text-fg-muted">
                          {t("trust.history.via", {
                            status: enumLabel(t, "tv", assessment.status),
                            provider: assessment.provider,
                          })}
                        </p>
                      </div>
                      {assessment.score != null && (
                        <TrustBadge label={t("trust.history.score", { score: assessment.score })} variant="info" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-fg">{t("trust.links.title")}</h2>
                <p className="mt-1 text-sm text-fg-secondary">{t("trust.links.body")}</p>
              </div>
              <Link href={localizePath("/candidate/profile", locale)} className="shrink-0">
                <Button size="sm" variant="outline">
                  {t("trust.links.edit")}
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.profile?.linkedinUrl && (
              <a href={dashboard.profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkRow}>
                {t("trust.links.linkedin")}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {dashboard.profile?.githubUrl && (
              <a href={dashboard.profile.githubUrl} target="_blank" rel="noopener noreferrer" className={linkRow}>
                {t("trust.links.github")}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {dashboard.profile?.portfolioUrl && (
              <a href={dashboard.profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className={linkRow}>
                {t("trust.links.portfolio")}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {!dashboard.profile?.linkedinUrl && !dashboard.profile?.githubUrl && !dashboard.profile?.portfolioUrl && (
              <div className={emptyBox}>{t("trust.links.empty")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("trust.submitted.title")}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.artifacts.length === 0 ? (
              <div className={emptyBox}>{t("trust.submitted.empty")}</div>
            ) : (
              dashboard.artifacts.map((artifact: VerificationArtifactItem) => (
                <div key={artifact.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{enumLabel(t, "tv", artifact.type)}</p>
                    <TrustBadge label={enumLabel(t, "tv", artifact.status)} variant={artifactTone(artifact.status)} />
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{t("trust.submitted.on", { date: fmt.date(artifact.submittedAt) })}</p>
                  <p className="mt-2 text-sm text-fg-secondary">{enumLabel(t, "trust.artifact", artifact.status)}</p>
                  {artifact.fileName && (
                    <p className="mt-2 text-sm text-fg-secondary">{t("trust.submitted.file", { name: artifact.fileName })}</p>
                  )}
                  {artifact.externalUrl && (
                    <a
                      href={artifact.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline"
                    >
                      {t("trust.submitted.link")}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                  {artifact.reviewerNotes && (
                    <p className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg-secondary">
                      {t("trust.submitted.notes", { notes: artifact.reviewerNotes })}
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title={t("trust.support.title")}
        description={t("trust.support.body")}
      />
    </div>
  );
}
