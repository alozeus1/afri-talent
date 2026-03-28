"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CandidateTrustDashboard, trust, VerificationArtifactItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { TrustChecklist } from "@/components/trust/trust-checklist";
import { TrustScoreCard } from "@/components/trust/trust-score-card";
import { uploadVerificationFile } from "@/lib/trust-files";
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

const candidateArtifactTypes = [
  { value: "IDENTITY_DOCUMENT", label: "Identity document" },
  { value: "CERTIFICATION", label: "Certification or skills proof" },
  { value: "EMPLOYMENT_PROOF", label: "Employment proof" },
] as const;

type CandidateArtifactType = (typeof candidateArtifactTypes)[number]["value"];

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
      setPageError(error instanceof Error ? error.message : "Failed to request verification code.");
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
      setPageError(
        error instanceof Error ? error.message : "Failed to submit candidate verification evidence.",
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
      <section className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 mb-3">
          Candidate Trust
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Strengthen your authenticity signals for employers</h1>
        <p className="max-w-3xl text-lg text-gray-600">
          Verification stays optional at first, but stronger trust signals improve recruiter confidence and unlock premium candidate filters.
        </p>
      </section>

      {pageError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      )}

      {pageSuccess && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {pageSuccess}
        </div>
      )}

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
                  <TrustBadge label={`Phone on file: ${dashboard.trust.maskedPhone}`} variant="info" />
                )}
                {dashboard.trust.premiumFilterEligible && (
                  <TrustBadge label="Eligible for premium verified filters" variant="success" />
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
            <h2 className="text-xl font-semibold text-gray-900">Phone verification</h2>
            <p className="text-sm text-gray-600">
              Add a phone number and verify it with a one-time code. This is one of the fastest ways to strengthen your profile.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Linked authenticity signals</h2>
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
              <p className="text-sm text-gray-600">
                Add LinkedIn, GitHub, or a portfolio in your profile to strengthen authenticity.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submitted evidence</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.artifacts.length === 0 ? (
              <p className="text-sm text-gray-600">
                No verification evidence has been submitted yet.
              </p>
            ) : (
              dashboard.artifacts.map((artifact: VerificationArtifactItem) => (
                <div key={artifact.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{humanizeTrustValue(artifact.type)}</p>
                    <TrustBadge label={humanizeTrustValue(artifact.status)} variant={artifact.status === "APPROVED" ? "success" : artifact.status === "REJECTED" ? "danger" : "warning"} />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Submitted {new Date(artifact.submittedAt).toLocaleDateString()}
                  </p>
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
    </div>
  );
}
