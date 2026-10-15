"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { applications, messages, Application } from "@/lib/api";
import { toFriendlyError } from "@/lib/friendly-error";
import { employerOnboardingEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadErrorCard } from "@/components/ui/load-error-card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { FREE_MODE } from "@/lib/free-mode";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

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

function ApplicantSummary({ application }: { application: Application }) {
  const profile = application.candidate?.candidateProfile;
  const location = application.candidate?.socialProfile?.location;
  if (!profile && !location) return null;

  const skills = (profile?.skills ?? []).filter(Boolean);
  const links = [
    { label: "LinkedIn", href: safeExternalUrl(profile?.linkedinUrl) },
    { label: "GitHub", href: safeExternalUrl(profile?.githubUrl) },
    { label: "Portfolio", href: safeExternalUrl(profile?.portfolioUrl) },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));
  const facts = [
    typeof profile?.yearsExperience === "number"
      ? `${profile.yearsExperience} yr${profile.yearsExperience === 1 ? "" : "s"} experience`
      : null,
    location || null,
    // The stored score can lag behind the profile (it refreshes on save), so
    // only surface it when it carries information.
    profile?.profileCompleteness ? `Profile ${profile.profileCompleteness}% complete` : null,
  ].filter(Boolean);

  return (
    <div className="mb-4 space-y-2" data-testid="applicant-summary">
      {profile?.headline && <p className="text-sm font-medium text-gray-800">{profile.headline}</p>}
      {facts.length > 0 && <p className="text-xs text-gray-500">{facts.join(" · ")}</p>}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 6).map((skill) => (
            <span key={skill} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              {skill}
            </span>
          ))}
          {skills.length > 6 && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">+{skills.length - 6} more</span>
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
              className="text-emerald-700 underline-offset-2 hover:underline"
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
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [candidateAccessLocked, setCandidateAccessLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [cvLoadingId, setCvLoadingId] = useState<string | null>(null);
  const [cvErrors, setCvErrors] = useState<Record<string, string>>({});
  const [cvLinks, setCvLinks] = useState<Record<string, string>>({});
  const [cvText, setCvText] = useState<{ name: string; text: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);

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
    } catch (err) {
      const friendly = toFriendlyError(err);
      setStatusErrors((prev) => ({
        ...prev,
        [applicationId]: `Status not updated. ${friendly.description}`,
      }));
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
        setCvText({ name: application.candidate?.name ?? "Candidate", text: cv.text });
      }
    } catch (err) {
      setCvErrors((prev) => ({ ...prev, [application.id]: toFriendlyError(err).description }));
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
      setMessageError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMessagingId(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 id="reject-dialog-title" className="mb-2 text-lg font-semibold text-gray-900">
                Reject {rejectTarget.candidate?.name ?? "this candidate"}?
              </h2>
              <p className="mb-6 text-sm text-gray-600">
                The candidate will be notified that their application was not successful.
              </p>
              <div className="flex gap-3">
                <Button variant="danger" className="flex-1" onClick={() => void confirmReject()}>
                  Reject application
                </Button>
                <Button variant="outline" onClick={() => setRejectTarget(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {cvText && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <Card className="flex max-h-[85vh] w-full max-w-2xl flex-col">
            <CardContent className="flex min-h-0 flex-col p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 id="cv-dialog-title" className="text-lg font-semibold text-gray-900">
                  {cvText.name}&apos;s resume
                </h2>
                <Button size="sm" variant="outline" onClick={() => setCvText(null)}>
                  Close
                </Button>
              </div>
              <pre
                data-testid="cv-text"
                className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-sans text-sm text-gray-800"
              >
                {cvText.text}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      <Link href={localizePath("/employer", locale)} className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          {!loadError && (
            <p className="text-gray-600">{jobApplications.length} candidate(s) applied</p>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : loadError ? (
            <LoadErrorCard error={loadError} subject="applications for this job" onRetry={retryLoadApplications} />
          ) : jobApplications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No applications yet</p>
            </div>
          ) : (
            <div>
              {candidateAccessLocked && !FREE_MODE && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  Applications are being counted, but full candidate profiles, resumes, and contact details unlock with an active employer subscription.
                  <Link href={localizePath("/billing", locale)} className="ml-1 font-semibold text-amber-950 underline">
                    Upgrade to review candidates
                  </Link>
                </div>
              )}
              <div className="divide-y divide-gray-200">
              {jobApplications.map((application) => (
                <div key={application.id} className="py-6">
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">{application.candidate?.name}</h3>
                      <p className="text-sm text-gray-600">{application.candidate?.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Applied {new Date(application.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={statusVariants[application.status] || "default"}>
                      {application.status}
                    </Badge>
                  </div>

                  {!candidateAccessLocked && <ApplicantSummary application={application} />}

                  {application.coverLetter && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <p className="text-sm text-gray-600 font-medium mb-1">Cover Letter</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {application.coverLetter}
                      </p>
                    </div>
                  )}

                  {!candidateAccessLocked && (
                    <div className="mb-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cvLoadingId === application.id}
                        onClick={() => void viewCv(application)}
                      >
                        {cvLoadingId === application.id ? "Opening CV..." : "View CV"}
                      </Button>
                      {cvLinks[application.id] && (
                        <a
                          href={cvLinks[application.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-3 text-sm text-emerald-700 underline-offset-2 hover:underline"
                        >
                          Open CV
                        </a>
                      )}
                      {cvErrors[application.id] && (
                        <p className="mt-1 text-xs text-gray-500">{cvErrors[application.id]}</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={candidateAccessLocked || updating === application.id || application.status === "REVIEWING"}
                      onClick={() => updateStatus(application.id, "REVIEWING")}
                    >
                      Mark Reviewing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={candidateAccessLocked || updating === application.id || application.status === "SHORTLISTED"}
                      onClick={() => updateStatus(application.id, "SHORTLISTED")}
                    >
                      Shortlist
                    </Button>
                    <Button
                      size="sm"
                      disabled={candidateAccessLocked || updating === application.id || application.status === "ACCEPTED"}
                      onClick={() => updateStatus(application.id, "ACCEPTED")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={candidateAccessLocked || updating === application.id || application.status === "REJECTED"}
                      onClick={() => setRejectTarget(application)}
                    >
                      Reject
                    </Button>
                  </div>
                  {statusErrors[application.id] && (
                    <p role="alert" className="mt-2 text-sm text-red-600">
                      {statusErrors[application.id]}
                    </p>
                  )}

                  {!candidateAccessLocked && application.candidate?.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {messageError && messagingId === application.candidate.id && (
                        <p className="text-xs text-red-500 mb-2">{messageError}</p>
                      )}
                      <div className="flex gap-2 items-start">
                        <textarea
                          className="flex-1 text-sm rounded-lg border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          rows={2}
                          placeholder="Send a message to this candidate..."
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
                          {messagingId === application.candidate.id && messageInput.trim() ? "Send" : "Message"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
