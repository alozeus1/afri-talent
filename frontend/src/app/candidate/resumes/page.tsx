"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Sparkles, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { profile, ResumeFile, ResumeProfileDraft } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT, type CandidateVars, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

type Feedback = { tone: "success" | "danger"; key: CandidateMessageKey; vars?: CandidateVars };

export default function ResumesPage() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [resumes, setResumes] = useState<ResumeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [draftApplied, setDraftApplied] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [parsedName, setParsedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResumeProfileDraft | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const fetchResumes = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await profile.resumes();
      setResumes(data);
    } catch (err) {
      console.error("Failed to load resumes", err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") fetchResumes();
  }, [user, fetchResumes]);

  const handleRegisterResume = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!fileName.trim()) {
      setFeedback({ tone: "danger", key: "resumes.register.nameRequired" });
      return;
    }
    if (!user) return;

    setUploading(true);
    setFeedback(null);
    try {
      const sanitizedName = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
      await profile.uploadResume({
        s3Key: `resumes/${user.id}/${sanitizedName}`,
        fileName: sanitizedName,
        setActive: true,
      });
      setFeedback({ tone: "success", key: "resumes.register.done", vars: { name: sanitizedName } });
      setFileName("");
      await fetchResumes();
    } catch {
      setFeedback({ tone: "danger", key: "resumes.register.failed" });
    } finally {
      setUploading(false);
    }
  };

  const handleSetActive = async (resumeId: string, resumeFileName: string) => {
    setSettingActive(resumeId);
    setFeedback(null);
    try {
      // Re-register with setActive to mark it active.
      const resume = resumes.find((r) => r.id === resumeId);
      if (!resume || !user) return;
      await profile.uploadResume({ s3Key: resume.s3Key, fileName: resume.fileName, setActive: true });
      setFeedback({ tone: "success", key: "resumes.setActive.done", vars: { name: resumeFileName } });
      await fetchResumes();
    } catch {
      setFeedback({ tone: "danger", key: "resumes.setActive.failed" });
    } finally {
      setSettingActive(null);
    }
  };

  const handleParseResume = async () => {
    if (!selectedFile) {
      setFeedback({ tone: "danger", key: "resumes.parse.chooseFile" });
      return;
    }
    setParsing(true);
    setFeedback(null);
    setDraftApplied(false);
    try {
      const response = await profile.parseResume(selectedFile);
      setDraft(response.profileDraft || {});
      setParsedName(response.parsed.name || null);
      setFeedback({ tone: "success", key: "resumes.parse.done" });
    } catch {
      setFeedback({ tone: "danger", key: "resumes.parse.failed" });
    } finally {
      setParsing(false);
    }
  };

  const updateDraftField = (field: keyof ResumeProfileDraft, value: string) => {
    setDraft((prev) => ({ ...(prev || {}), [field]: value || undefined }));
  };

  const handleApplyDraft = async () => {
    if (!draft) return;
    setApplyingDraft(true);
    setFeedback(null);
    try {
      await profile.applyResumeDraft({
        confirm: true,
        overwriteExisting,
        draft: {
          ...draft,
          skills: draft.skills?.map((item) => item.trim()).filter(Boolean),
          targetRoles: draft.targetRoles?.map((item) => item.trim()).filter(Boolean),
        },
      });
      setDraftApplied(true);
      setFeedback({ tone: "success", key: "resumes.draft.applied" });
    } catch {
      setFeedback({ tone: "danger", key: "resumes.draft.applyFailed" });
    } finally {
      setApplyingDraft(false);
    }
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const activeResume = resumes.find((r) => r.isActive);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("resumes.title")}
        description={t("resumes.subtitle")}
        actions={
          <Link href={localizePath("/candidate/resume-builder", locale)}>
            <Button>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("resumes.builder")}
            </Button>
          </Link>
        }
      />

      {feedback && (
        <CandidateNotice tone={feedback.tone} className="mb-6">
          {t(feedback.key, feedback.vars)}
          {draftApplied && feedback.key === "resumes.draft.applied" ? (
            <Link href={localizePath("/candidate/profile", locale)} className="ms-2 underline">
              {t("resumes.draft.viewProfile")}
            </Link>
          ) : null}
        </CandidateNotice>
      )}

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("resumes.active")}</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CandidateSpinner className="py-6" />
          ) : activeResume ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-success-line bg-success-soft p-4">
              <div className="flex min-w-0 items-center gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-text"
                >
                  <FileText className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{activeResume.fileName}</p>
                  <p className="text-sm text-fg-secondary">{t("resumes.uploaded", { date: fmt.date(activeResume.uploadedAt) })}</p>
                </div>
              </div>
              <Badge variant="success">{t("resumes.activeBadge")}</Badge>
            </div>
          ) : (
            <div className="py-6 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-fg-muted" aria-hidden="true" />
              <p className="font-medium text-fg">{t("resumes.noActive")}</p>
              <p className="mt-1 text-sm text-fg-muted">{t("resumes.noActiveHint")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("resumes.parse.title")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("resumes.parse.body")}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="resume-parse-file" className={candidateLabelClass}>
                {t("resumes.parse.fileLabel")}
              </label>
              <input
                id="resume-parse-file"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className={`${candidateFieldClass} file:me-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-fg`}
              />
            </div>
            <Button onClick={handleParseResume} disabled={!selectedFile || parsing} isLoading={parsing}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {parsing ? t("resumes.parse.parsing") : t("resumes.parse.cta")}
            </Button>
          </div>

          {draft && (
            <div className="mt-6 rounded-2xl border border-line bg-surface-sunken p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-fg">{t("resumes.draft.title")}</h3>
                  {parsedName && <p className="mt-1 text-xs text-fg-muted">{t("resumes.draft.detectedName", { name: parsedName })}</p>}
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(event) => setOverwriteExisting(event.target.checked)}
                    className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
                  />
                  {t("resumes.draft.overwrite")}
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  id="draftHeadline"
                  label={t("resumes.draft.headline")}
                  value={draft.headline || ""}
                  onChange={(event) => updateDraftField("headline", event.target.value)}
                />
                <Input
                  id="draftYears"
                  type="number"
                  min={0}
                  label={t("resumes.draft.years")}
                  value={draft.yearsExperience?.toString() || ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      yearsExperience: event.target.value ? Number(event.target.value) : undefined,
                    }))
                  }
                />
                <Input
                  id="draftSkills"
                  label={t("resumes.draft.skills")}
                  value={(draft.skills || []).join(", ")}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    }))
                  }
                />
                <Input
                  id="draftRoles"
                  label={t("resumes.draft.roles")}
                  value={(draft.targetRoles || []).join(", ")}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...(prev || {}),
                      targetRoles: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    }))
                  }
                />
                <Input
                  id="draftLinkedIn"
                  label={t("profile.linkedin")}
                  value={draft.linkedinUrl || ""}
                  onChange={(event) => updateDraftField("linkedinUrl", event.target.value)}
                />
                <Input
                  id="draftGithub"
                  label={t("profile.github")}
                  value={draft.githubUrl || ""}
                  onChange={(event) => updateDraftField("githubUrl", event.target.value)}
                />
              </div>

              <div className="mt-4">
                <label htmlFor="draftBio" className={candidateLabelClass}>
                  {t("resumes.draft.bio")}
                </label>
                <textarea
                  id="draftBio"
                  className={`${candidateFieldClass} resize-y`}
                  rows={5}
                  value={draft.bio || ""}
                  onChange={(event) => updateDraftField("bio", event.target.value)}
                />
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleApplyDraft} disabled={applyingDraft}>
                  {applyingDraft ? t("resumes.draft.applying") : t("resumes.draft.apply")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("resumes.register.title")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("resumes.register.body")}</p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleRegisterResume}>
            <div className="flex-1">
              <Input
                id="resume-file-name"
                label={t("resumes.register.label")}
                placeholder={t("resumes.register.placeholder")}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                disabled={uploading}
                dir="ltr"
              />
            </div>
            <Button type="submit" variant="outline" disabled={uploading || !fileName.trim()}>
              {uploading ? t("resumes.register.registering") : t("resumes.register.cta")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("resumes.all")}</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CandidateSpinner className="py-8" />
          ) : loadError ? (
            <CandidateLoadError error={loadError} subject={t("ui.subject.resumes")} onRetry={fetchResumes} />
          ) : resumes.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-fg-muted" aria-hidden="true" />
              <p className="mb-1 font-medium text-fg">{t("resumes.noActiveHint")}</p>
              <p className="text-sm text-fg-muted">{t("resumes.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {resumes.map((resume) => (
                <li key={resume.id} className="flex items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-fg-muted"
                    >
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{resume.fileName}</p>
                      <p className="text-sm text-fg-muted">{t("resumes.uploaded", { date: fmt.date(resume.uploadedAt) })}</p>
                    </div>
                  </div>
                  {resume.isActive ? (
                    <Badge variant="success">{t("resumes.activeBadge")}</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetActive(resume.id, resume.fileName)}
                      disabled={settingActive === resume.id}
                      isLoading={settingActive === resume.id}
                    >
                      {t("resumes.setActive")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
