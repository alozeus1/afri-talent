"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustChecklist } from "@/components/trust/trust-checklist";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustScoreCard } from "@/components/trust/trust-score-card";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { uploadVerificationFile } from "@/lib/trust-files";
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

const candidateArtifactTypes = [
  { value: "IDENTITY_DOCUMENT", label: "Identity document" },
  { value: "CERTIFICATION", label: "Certification or skills proof" },
  { value: "EMPLOYMENT_PROOF", label: "Employment proof" },
] as const;

type CandidateArtifactType = (typeof candidateArtifactTypes)[number]["value"];
type CandidateSkillMethod = "CERTIFICATE" | "PORTFOLIO" | "ASSESSMENT";

function artifactStatusCopy(status: VerificationArtifactItem["status"]) {
  if (status === "APPROVED") {
    return {
      tone: "success" as const,
      summary: "Approved and now strengthening your employer-facing trust profile.",
    };
  }

  if (status === "REJECTED") {
    return {
      tone: "danger" as const,
      summary: "This evidence was not accepted. Update it before resubmitting.",
    };
  }

  if (status === "NEEDS_MORE_INFO") {
    return {
      tone: "warning" as const,
      summary: "A reviewer needs more detail before this trust signal can be approved.",
    };
  }

  return {
    tone: "warning" as const,
    summary: "Submitted and waiting for review.",
  };
}

export default function CandidateTrustPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [dashboard, setDashboard] = useState<CandidateTrustDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);
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

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadDashboard();
    }
  }, [user]);

  const linkedSignalCount = useMemo(() => {
    if (!dashboard?.profile) return 0;
    return [
      dashboard.profile.linkedinUrl,
      dashboard.profile.githubUrl,
      dashboard.profile.portfolioUrl,
    ].filter(Boolean).length;
  }, [dashboard?.profile]);

  const completedAssessments = useMemo(
    () => (dashboard?.assessments || []).filter((assessment) => assessment.status === "COMPLETED"),
    [dashboard?.assessments],
  );

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
        title: "Loading your trust profile",
        body: "We are preparing your current authenticity summary.",
      };
    }

    if (artifactSummary.rejected > 0) {
      return {
        tone: "danger" as const,
        title: "Some verification evidence needs attention",
        body: "At least one submission was rejected or needs more information. Updating it is the fastest way to avoid a confusing employer-facing trust profile.",
      };
    }

    if (artifactSummary.pending > 0) {
      return {
        tone: "info" as const,
        title: "Review in progress",
        body: "Your latest verification evidence is being assessed. Employers still see your current approved signals while review is underway.",
      };
    }

    if (!dashboard.trust.premiumFilterEligible) {
      return {
        tone: "warning" as const,
        title: "Your trust profile is still building",
        body: "Verification is optional at first, but stronger evidence helps employers feel safer shortlisting you and unlocks premium verified-candidate filters.",
      };
    }

    return {
      tone: "success" as const,
      title: "Your trust profile is employer-ready",
      body: "Your current evidence gives employers a stronger reason to trust your profile beyond self-reported information.",
    };
  }, [artifactSummary.pending, artifactSummary.rejected, dashboard]);

  const loadDashboard = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const result = await trust.candidateSummary();
      setDashboard(result);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load candidate trust data.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setRequestingOtp(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const result = await trust.requestPhoneOtp(phoneNumber);
      setOtpPreview(result.previewCode || null);
      setOtpExpiresAt(result.expiresAt);
      setPageSuccess("Verification code created. Enter it below to complete phone verification.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPageError(
        msg === "sms_provider_unconfigured" || msg.includes("SMS_DISABLED")
          ? "Phone verification is not available in this environment. Contact support."
          : msg || "Failed to request verification code.",
      );
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setVerifyingOtp(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      await trust.verifyPhoneOtp(phoneNumber, otpCode);
      setOtpCode("");
      setOtpPreview(null);
      setOtpExpiresAt(null);
      await loadDashboard();
      setPageSuccess("Phone verification completed.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to verify code.");
    } finally {
      setVerifyingOtp(false);
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
      setPageSuccess("Verification evidence submitted for review.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPageError(
        msg.includes("S3_NOT_CONFIGURED") || msg.includes("not configured on this server")
          ? "Document upload is not available in this environment. Contact your administrator."
          : msg || "Failed to submit candidate verification evidence.",
      );
    } finally {
      setSubmittingArtifact(false);
    }
  };

  const handleSkillVerificationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingSkill(true);
    setPageError(null);
    setPageSuccess(null);

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
      setPageSuccess(
        skillMethod === "ASSESSMENT"
          ? "Assessment-backed skill verification processed."
          : "Skill evidence submitted for trust review.",
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setPageError(
        msg.includes("S3_NOT_CONFIGURED") || msg.includes("not configured on this server")
          ? "Document upload is not available in this environment. Contact your administrator."
          : msg || "Failed to submit skill verification evidence.",
      );
    } finally {
      setSubmittingSkill(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <TrustStatusBanner
          tone="danger"
          title="We couldn't load your trust profile"
          body={pageError ?? "Try again in a moment."}
          actions={<Button size="sm" onClick={loadDashboard}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
          Candidate Trust
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Show employers proof, not just profile claims</h1>
        <p className="max-w-3xl text-lg leading-8 text-gray-600">
          Verification stays optional at first, but stronger trust signals help recruiters move faster with more confidence. AfriTalent combines multiple signals so no single link or upload decides everything.
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
        title={dashboard.profile?.headline || user.name}
        subtitle="We use email, phone, identity, skills, employment evidence, profile completeness, and linked profiles together instead of trusting a single self-asserted signal."
        badge={dashboard.trust.badge}
        authenticityScore={dashboard.trust.authenticityScore}
        riskScore={dashboard.trust.riskScore}
        riskLevel={dashboard.trust.riskLevel}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={localizePath("/candidate/profile", locale)}>
              <Button size="sm">Update profile</Button>
            </Link>
            <TrustExplainerModal
              title="How employers interpret your trust profile"
              description="Recruiters should be able to see which parts of your profile are verified, which are still improving, and which need more evidence."
              items={dashboard.trust.explainability.map((signal) => ({
                title: signal.label,
                description: signal.detail,
                statusLabel:
                  signal.status === "verified"
                    ? "Verified"
                    : signal.status === "needs_attention"
                      ? "Needs attention"
                      : "Strengthening",
                statusVariant:
                  signal.status === "verified"
                    ? "success"
                    : signal.status === "needs_attention"
                      ? "warning"
                      : "info",
              }))}
              triggerLabel="What employers see"
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
              <h3 className="text-lg font-semibold text-gray-900">Employer-facing trust signals</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <TrustBadge label={dashboard.trust.badge} riskLevel={dashboard.trust.riskLevel} variant="success" />
                {dashboard.trust.maskedPhone && (
                  <TrustBadge label={`Phone verified: ${dashboard.trust.maskedPhone}`} variant="info" />
                )}
                {dashboard.trust.premiumFilterEligible && (
                  <TrustBadge label="Eligible for verified-candidate filters" variant="success" />
                )}
                {dashboard.trust.verifiedSkillCount > 0 && (
                  <TrustBadge label={`${dashboard.trust.verifiedSkillCount} verified skill badge${dashboard.trust.verifiedSkillCount === 1 ? "" : "s"}`} variant="success" />
                )}
                {dashboard.trust.partnerSignalCount > 0 && (
                  <TrustBadge label={`${dashboard.trust.partnerSignalCount} partner trust marker${dashboard.trust.partnerSignalCount === 1 ? "" : "s"}`} variant="info" />
                )}
                {dashboard.trust.assessmentBacked && (
                  <TrustBadge label="Assessment-verified" variant="success" />
                )}
                {dashboard.trust.fullyCompletedProfile && (
                  <TrustBadge label="Complete profile" variant="success" />
                )}
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Profile completeness is{" "}
                <span className="font-semibold text-gray-900">
                  {dashboard.profile?.profileCompleteness ?? 0}%
                </span>
                {" "}and you currently have{" "}
                <span className="font-semibold text-gray-900">{linkedSignalCount}</span>
                {" "}linked profile signal{linkedSignalCount === 1 ? "" : "s"}.
              </p>
              <p className="mt-3 text-sm text-gray-600">
                Employers may pay for premium filters, but they only see verified-candidate badges when your evidence actually clears AfriTalent trust checks.
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.trust.explainability.map((signal) => (
          <Card key={signal.key}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{signal.label}</p>
                  <p className="mt-2 text-sm text-gray-600">{signal.detail}</p>
                </div>
                <TrustBadge
                  label={humanizeTrustValue(signal.status)}
                  variant={
                    signal.status === "verified"
                      ? "success"
                      : signal.status === "needs_attention"
                        ? "warning"
                        : "info"
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Phone verification</h2>
            <p className="text-sm text-gray-600">
              Add a phone number and verify it with a one-time code. This is one of the fastest ways to strengthen your profile.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.trust.maskedPhone ? (
              <TrustStatusBanner
                tone="success"
                title="Phone verification already completed"
                body={`Employers currently see a verified phone signal tied to ${dashboard.trust.maskedPhone}.`}
              />
            ) : (
              <TrustStatusBanner
                tone="info"
                title="Phone verification is one of the fastest trust wins"
                body="It gives employers one more real-world signal that your profile belongs to a reachable person."
              />
            )}

            <Input
              label="Phone number"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+2348012345678"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleRequestOtp} disabled={requestingOtp || !phoneNumber.trim()}>
                {requestingOtp ? "Creating code..." : "Send verification code"}
              </Button>
              {otpExpiresAt && (
                <p className="flex items-center text-sm text-gray-500">
                  Expires {new Date(otpExpiresAt).toLocaleTimeString()}
                </p>
              )}
            </div>

            {otpPreview && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Development preview code: <span className="font-semibold">{otpPreview}</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                label="6-digit code"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
              <Button type="submit" disabled={verifyingOtp || !otpCode.trim()}>
                {verifyingOtp ? "Verifying..." : "Verify phone"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submit verification evidence</h2>
            <p className="text-sm text-gray-600">
              Upload identity, certification, or employment evidence. You can also provide a verification URL when relevant.
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
                  onChange={(event) => setArtifactType(event.target.value as CandidateArtifactType)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {candidateArtifactTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

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

              <Input
                label="Supporting URL"
                value={artifactUrl}
                onChange={(event) => setArtifactUrl(event.target.value)}
                placeholder="Optional credential URL or public verification page"
              />

              <Button type="submit" disabled={submittingArtifact}>
                {submittingArtifact ? "Submitting..." : "Submit for review"}
              </Button>
              <p className="text-xs leading-5 text-gray-500">
                Submissions are reviewed before they become visible to employers. If we need more detail, reviewer notes will appear in your evidence history below.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Verified skills</h2>
            <p className="text-sm text-gray-600">
              Submit certificate-backed, portfolio-backed, or assessment-backed skills. Only approved checks become employer-facing badges.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSkillVerificationSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Skill"
                  value={skillName}
                  onChange={(event) => setSkillName(event.target.value)}
                  placeholder="TypeScript"
                />
                <div>
                  <label htmlFor="skillMethod" className="block text-sm font-medium text-gray-700 mb-1">
                    Verification method
                  </label>
                  <select
                    id="skillMethod"
                    value={skillMethod}
                    onChange={(event) => setSkillMethod(event.target.value as CandidateSkillMethod)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ASSESSMENT">Assessment-backed</option>
                    <option value="CERTIFICATE">Certificate-backed</option>
                    <option value="PORTFOLIO">Portfolio-backed</option>
                  </select>
                </div>
              </div>

              <Input
                label="Evidence label"
                value={skillEvidenceLabel}
                onChange={(event) => setSkillEvidenceLabel(event.target.value)}
                placeholder="AWS Certified Developer or Production case study"
              />

              {skillMethod === "ASSESSMENT" && (
                <div>
                  <label htmlFor="selectedAssessmentId" className="block text-sm font-medium text-gray-700 mb-1">
                    Completed assessment
                  </label>
                  <select
                    id="selectedAssessmentId"
                    value={selectedAssessmentId}
                    onChange={(event) => setSelectedAssessmentId(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Choose an assessment</option>
                    {completedAssessments.map((assessment) => (
                      <option key={assessment.id} value={assessment.id}>
                        {assessment.skillName} {assessment.score != null ? `(${assessment.score})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    Assessment-backed badges are only granted when the result clears AfriTalent&apos;s verification threshold.
                  </p>
                </div>
              )}

              {skillMethod !== "ASSESSMENT" && (
                <>
                  {skillMethod === "CERTIFICATE" && (
                    <div>
                      <label htmlFor="skillEvidenceFile" className="block text-sm font-medium text-gray-700 mb-1">
                        Upload certificate
                      </label>
                      <input
                        id="skillEvidenceFile"
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setSkillEvidenceFile(event.target.files?.[0] || null)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                      />
                    </div>
                  )}
                  <Input
                    label={skillMethod === "CERTIFICATE" ? "Public credential URL" : "Portfolio or GitHub URL"}
                    value={skillEvidenceUrl}
                    onChange={(event) => setSkillEvidenceUrl(event.target.value)}
                    placeholder={
                      skillMethod === "CERTIFICATE"
                        ? "https://credential.example"
                        : "https://github.com/you/project"
                    }
                  />
                </>
              )}

              <Button
                type="submit"
                disabled={
                  submittingSkill ||
                  !skillName.trim() ||
                  (skillMethod === "ASSESSMENT" && !selectedAssessmentId)
                }
              >
                {submittingSkill ? "Submitting..." : "Submit skill verification"}
              </Button>
              <p className="text-xs leading-5 text-gray-500">
                Skill badges are evidence-based. Uploading a file or link alone does not guarantee approval.
              </p>
            </form>

            <div className="mt-6 space-y-3">
              {dashboard.skillVerifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                  No skill verification records yet. Start with one high-confidence skill that you can prove clearly.
                </div>
              ) : (
                dashboard.skillVerifications.map((skill: CandidateVerifiedSkillItem) => (
                  <div key={skill.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{skill.skillName}</p>
                      <TrustBadge
                        label={humanizeTrustValue(skill.status)}
                        variant={
                          skill.status === "VERIFIED"
                            ? "success"
                            : skill.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      />
                      <TrustBadge label={humanizeTrustValue(skill.method)} variant="info" />
                    </div>
                    {(skill.evidenceLabel || skill.confidenceNote) && (
                      <p className="mt-2 text-sm text-gray-600">
                        {skill.evidenceLabel || skill.confidenceNote}
                      </p>
                    )}
                    {skill.partner && (
                      <p className="mt-2 text-xs text-gray-500">
                        Verified via {skill.partner.name}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Partner-issued trust markers</h2>
            <p className="text-sm text-gray-600">
              Universities, bootcamps, training providers, and scholarship partners can issue high-confidence markers to your profile.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.partnerMarkers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                No partner markers yet. These are issued through approved universities, bootcamps, training institutes, and scholarship partners.
              </div>
            ) : (
              dashboard.partnerMarkers.map((marker: CandidatePartnerMarkerItem) => (
                <div key={marker.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{marker.label}</p>
                    <TrustBadge
                      label={humanizeTrustValue(marker.status)}
                      variant={marker.status === "ACTIVE" ? "success" : "warning"}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {marker.description || `${marker.partner.name} issued this trust marker.`}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    {marker.partner.name} • {humanizeTrustValue(marker.partner.organizationType)}
                  </p>
                </div>
              ))
            )}

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Assessment history</p>
              <div className="mt-3 space-y-2">
                {dashboard.assessments.length === 0 ? (
                  <p className="text-sm text-blue-800">No skill assessments completed yet.</p>
                ) : (
                  dashboard.assessments.slice(0, 5).map((assessment) => (
                    <div key={assessment.id} className="flex items-center justify-between gap-4 rounded-xl bg-white px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{assessment.skillName}</p>
                        <p className="text-xs text-gray-500">
                          {humanizeTrustValue(assessment.status)} via {assessment.provider}
                        </p>
                      </div>
                      {assessment.score != null && (
                        <TrustBadge label={`Score ${assessment.score}`} variant="info" />
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
                <h2 className="text-xl font-semibold text-gray-900">Linked authenticity signals</h2>
                <p className="mt-1 text-sm text-gray-600">
                  LinkedIn, GitHub, and portfolio links help employers cross-check that your work history and skill claims are real.
                </p>
              </div>
              <Link href={localizePath("/candidate/profile", locale)}>
                <Button size="sm" variant="outline">Edit links</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.profile?.linkedinUrl && (
              <a href={dashboard.profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-emerald-700 hover:text-emerald-800">
                LinkedIn profile
              </a>
            )}
            {dashboard.profile?.githubUrl && (
              <a href={dashboard.profile.githubUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-emerald-700 hover:text-emerald-800">
                GitHub profile
              </a>
            )}
            {dashboard.profile?.portfolioUrl && (
              <a href={dashboard.profile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-emerald-700 hover:text-emerald-800">
                Portfolio
              </a>
            )}
            {!dashboard.profile?.linkedinUrl && !dashboard.profile?.githubUrl && !dashboard.profile?.portfolioUrl && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                Add LinkedIn, GitHub, or a portfolio in your profile to strengthen authenticity and give employers more confidence in your work history.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submitted evidence</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.artifacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
                No verification evidence has been submitted yet. A clear ID, certification, or employment proof is usually the best first step.
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
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title="Need help with a trust review?"
        description="If a verification outcome looks wrong, you are dealing with suspicious outreach, or you need help understanding what employers can see, contact support or file a trust report."
      />
    </div>
  );
}
