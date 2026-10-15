"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { applications, messages, Application } from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BackLink,
  EmployerDialog,
  EmployerLoadError,
  EmptyPanel,
  Eyebrow,
  Notice,
  PageSpinner,
  Spinner,
} from "@/components/employer/employer-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

const PIPELINE_FILTERS = ["ALL", "PENDING", "REVIEWING", "SHORTLISTED", "ACCEPTED", "REJECTED"] as const;
type PipelineFilter = (typeof PIPELINE_FILTERS)[number];

function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function ApplicantSummary({ application }: { application: Application }) {
  const { t, tn } = useEmployerI18n();
  const profile = application.candidate?.candidateProfile;
  const location = application.candidate?.socialProfile?.location;
  if (!profile && !location) return null;

  const skills = (profile?.skills ?? []).filter(Boolean);
  const links = [
    { label: "LinkedIn", href: safeExternalUrl(profile?.linkedinUrl) },
    { label: "GitHub", href: safeExternalUrl(profile?.githubUrl) },
    { label: t("common.portfolio"), href: safeExternalUrl(profile?.portfolioUrl) },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));
  const facts = [
    typeof profile?.yearsExperience === "number" ? tn("common.yearsExperience", profile.yearsExperience) : null,
    location || null,
    // The stored score can lag behind the profile (it refreshes on save), so
    // only surface it when it carries information.
    profile?.profileCompleteness ? t("apps.profileComplete", { pct: profile.profileCompleteness }) : null,
  ].filter(Boolean);

  return (
    <div className="mb-4 space-y-2" data-testid="applicant-summary">
      {profile?.headline && <p className="text-sm font-medium text-fg">{profile.headline}</p>}
      {facts.length > 0 && <p className="text-xs text-fg-muted">{facts.join(" · ")}</p>}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 6).map((skill) => (
            <span key={skill} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-text">
              {skill}
            </span>
          ))}
          {skills.length > 6 && (
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-fg-secondary">
              {t("apps.moreSkills", { count: skills.length - 6 })}
            </span>
          )}
        </div>
      )}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobApplicationsPage() {
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tn, tv, fmt } = useEmployerI18n();
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [candidateAccessLocked, setCandidateAccessLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [statusErrors, setStatusErrors] = useState<Record<string, boolean>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [cvLoadingId, setCvLoadingId] = useState<string | null>(null);
  const [cvErrors, setCvErrors] = useState<Record<string, boolean>>({});
  const [cvLinks, setCvLinks] = useState<Record<string, string>>({});
  const [cvText, setCvText] = useState<{ name: string; text: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [filter, setFilter] = useState<PipelineFilter>("ALL");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const jobId = params.id as string;
  const loadApplications = useCallback(() => {
    applications
      .forJob(jobId)
      .then((response) => {
        setJobApplications(response);
        setCandidateAccessLocked(response.some((application) => Boolean(application.locked)));
        employerOnboardingEvents.candidateListViewed({
          job_id: jobId,
          applicant_count: response.length,
        });
      })
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, [jobId]);

  const retryLoadApplications = () => {
    setLoading(true);
    setLoadError(null);
    loadApplications();
  };

  const isEmployer = user?.role === "EMPLOYER";
  useEffect(() => {
    if (isEmployer) {
      loadApplications();
    }
  }, [isEmployer, loadApplications]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { ALL: jobApplications.length };
    for (const application of jobApplications) {
      result[application.status] = (result[application.status] ?? 0) + 1;
    }
    return result;
  }, [jobApplications]);

  const visibleApplications =
    filter === "ALL" ? jobApplications : jobApplications.filter((application) => application.status === filter);

  const updateStatus = async (applicationId: string, status: string) => {
    if (!user) return;
    setUpdating(applicationId);
    setStatusErrors((prev) => {
      const next = { ...prev };
      delete next[applicationId];
      return next;
    });
    try {
      const updated = await applications.updateStatus(applicationId, { status });
      setJobApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: updated.status } : a))
      );
    } catch {
      setStatusErrors((prev) => ({ ...prev, [applicationId]: true }));
    } finally {
      setUpdating(null);
    }
  };

  const viewCv = async (application: Application) => {
    setCvLoadingId(application.id);
    setCvErrors((prev) => {
      const next = { ...prev };
      delete next[application.id];
      return next;
    });
    try {
      const cv = await applications.cv(application.id);
      if (cv.url) {
        // No "noopener" feature string: it makes window.open return null even
        // on success. Detach the opener manually instead, and fall back to a
        // link when a popup blocker stops the new tab.
        const opened = window.open(cv.url, "_blank");
        if (opened) {
          opened.opener = null;
        } else {
          setCvLinks((prev) => ({ ...prev, [application.id]: cv.url! }));
        }
        return;
      }
      if (cv.text) {
        setCvText({ name: application.candidate?.name ?? t("apps.candidateFallback"), text: cv.text });
      }
    } catch {
      setCvErrors((prev) => ({ ...prev, [application.id]: true }));
    } finally {
      setCvLoadingId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    await updateStatus(target.id, "REJECTED");
  };

  const startThread = async (candidateUserId: string) => {
    if (!user || !messageInput.trim()) return;
    setMessagingId(candidateUserId);
    setMessageError(null);
    try {
      const result = await messages.createThread({
        participantId: candidateUserId,
        jobId: params.id as string,
        message: messageInput.trim(),
      });
      router.push(localizePath(`/messages/${result.id}`, locale));
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        const match = err.message.match(/threadId[": ]+([a-z0-9-]+)/i);
        if (match) {
          router.push(localizePath(`/messages/${match[1]}`, locale));
          return;
        }
      }
      setMessageError(err instanceof Error && err.message ? err.message : t("message.sendFailed"));
    } finally {
      setMessagingId(null);
    }
  };

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  const jobTitle = jobApplications[0]?.job?.title;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {rejectTarget && (
        <EmployerDialog
          title={t("apps.rejectTitle", { name: rejectTarget.candidate?.name ?? t("apps.thisCandidate") })}
          description={t("apps.rejectBody")}
          onClose={() => setRejectTarget(null)}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={() => void confirmReject()}>
              {t("apps.rejectConfirm")}
            </Button>
          </div>
        </EmployerDialog>
      )}

      {cvText && (
        <EmployerDialog size="lg" title={t("apps.resumeOf", { name: cvText.name })} onClose={() => setCvText(null)}>
          <pre
            data-testid="cv-text"
            className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-surface-sunken p-4 font-sans text-sm text-fg"
          >
            {cvText.text}
          </pre>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setCvText(null)}>
              {t("common.close")}
            </Button>
          </div>
        </EmployerDialog>
      )}

      <BackLink href={localizePath("/employer", locale)}>{t("common.backToDashboard")}</BackLink>

      <Card>
        <CardHeader>
          <Eyebrow>{t("apps.eyebrow")}</Eyebrow>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{jobTitle ?? t("apps.title")}</h1>
          {!loadError && !loading && (
            <p className="mt-1 text-sm text-fg-secondary">{tn("apps.count", jobApplications.length)}</p>
          )}
          {!loadError && jobApplications.length > 0 && (
            <div
              role="tablist"
              aria-label={t("apps.filterLabel")}
              className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 hide-scrollbar"
            >
              {PIPELINE_FILTERS.map((value) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(value)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      active
                        ? "border-transparent bg-primary text-primary-fg"
                        : "border-line bg-surface text-fg-secondary hover:bg-surface-muted hover:text-fg"
                    }`}
                  >
                    {value === "ALL" ? t("apps.filterAll") : tv("status.app", value)}
                    <span
                      className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-surface-muted text-fg-muted"}`}
                    >
                      {counts[value] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : loadError ? (
            <EmployerLoadError subject={t("apps.loadSubject")} onRetry={retryLoadApplications} />
          ) : jobApplications.length === 0 ? (
            <EmptyPanel title={t("apps.emptyTitle")} description={t("apps.emptyBody")} />
          ) : (
            <div>
              {candidateAccessLocked && !FREE_MODE && (
                <Notice tone="warning" className="mb-4">
                  {t("apps.locked")}{" "}
                  <Link href={localizePath("/billing", locale)} className="font-semibold text-fg underline">
                    {t("apps.unlock")}
                  </Link>
                </Notice>
              )}
              {visibleApplications.length === 0 ? (
                <p className="py-8 text-center text-sm text-fg-muted">{t("apps.filterEmpty")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {visibleApplications.map((application) => (
                    <li key={application.id} className="py-6">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text"
                          >
                            {initials(application.candidate?.name)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-fg">{application.candidate?.name}</h3>
                            {application.candidate?.email && (
                              <p className="truncate text-sm text-fg-secondary">{application.candidate.email}</p>
                            )}
                            <p className="mt-1 text-xs text-fg-muted">
                              {t("apps.appliedOn", { date: fmt.date(application.createdAt) })}
                            </p>
                          </div>
                        </div>
                        <Badge variant={statusVariants[application.status] || "default"}>
                          {tv("status.app", application.status)}
                        </Badge>
                      </div>

                      <div className="sm:ps-[52px]">
                        {!candidateAccessLocked && <ApplicantSummary application={application} />}

                        {application.coverLetter && (
                          <div className="mb-4 rounded-xl border border-line bg-surface-sunken p-4">
                            <p className="mb-1 text-sm font-medium text-fg">{t("apps.coverLetter")}</p>
                            <p className="whitespace-pre-wrap text-sm text-fg-secondary">{application.coverLetter}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {!candidateAccessLocked && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={cvLoadingId === application.id}
                              onClick={() => void viewCv(application)}
                            >
                              {cvLoadingId === application.id ? t("apps.openingCv") : t("apps.viewCv")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={candidateAccessLocked || updating === application.id || application.status === "REVIEWING"}
                            onClick={() => updateStatus(application.id, "REVIEWING")}
                          >
                            {t("apps.markReviewing")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={candidateAccessLocked || updating === application.id || application.status === "SHORTLISTED"}
                            onClick={() => updateStatus(application.id, "SHORTLISTED")}
                          >
                            {t("apps.shortlist")}
                          </Button>
                          <Button
                            size="sm"
                            disabled={candidateAccessLocked || updating === application.id || application.status === "ACCEPTED"}
                            onClick={() => updateStatus(application.id, "ACCEPTED")}
                          >
                            {t("apps.accept")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:text-danger"
                            disabled={candidateAccessLocked || updating === application.id || application.status === "REJECTED"}
                            onClick={() => setRejectTarget(application)}
                          >
                            {t("apps.reject")}
                          </Button>
                        </div>
                        {cvLinks[application.id] && (
                          <a
                            href={cvLinks[application.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex text-sm font-medium text-primary-text underline-offset-2 hover:underline"
                          >
                            {t("apps.openCv")}
                          </a>
                        )}
                        {cvErrors[application.id] && <p className="mt-2 text-xs text-fg-muted">{t("apps.cvFailed")}</p>}
                        {statusErrors[application.id] && (
                          <p role="alert" className="mt-2 text-sm text-danger">
                            {t("apps.statusFailed")}
                          </p>
                        )}

                        {!candidateAccessLocked && application.candidate?.id && (
                          <div className="mt-4 border-t border-line pt-4">
                            {messageError && messagingId === application.candidate.id && (
                              <p role="alert" className="mb-2 text-xs text-danger">{messageError}</p>
                            )}
                            <div className="flex items-start gap-2">
                              <label htmlFor={`message-${application.id}`} className="sr-only">
                                {t("apps.messageLabel", { name: application.candidate.name ?? t("apps.candidateFallback") })}
                              </label>
                              <textarea
                                id={`message-${application.id}`}
                                className="flex-1 resize-none rounded-xl border border-line-strong bg-surface-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus"
                                rows={2}
                                placeholder={t("apps.messagePlaceholder")}
                                value={messagingId === application.candidate.id ? messageInput : ""}
                                onChange={(e) => {
                                  setMessagingId(application.candidate!.id);
                                  setMessageInput(e.target.value);
                                }}
                              />
                              <Button
                                size="sm"
                                disabled={!messageInput.trim() || messagingId !== application.candidate.id}
                                onClick={() => startThread(application.candidate!.id)}
                              >
                                {messagingId === application.candidate.id && messageInput.trim()
                                  ? t("common.send")
                                  : t("message.button")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
