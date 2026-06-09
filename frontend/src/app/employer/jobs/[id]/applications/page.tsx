"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { applications, messages, Application } from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

export default function JobApplicationsPage() {
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [candidateAccessLocked, setCandidateAccessLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      applications
        .forJob(params.id as string)
        .then((response) => {
          setJobApplications(response);
          setCandidateAccessLocked(response.some((application) => Boolean(application.locked)));
          employerOnboardingEvents.candidateListViewed({
            job_id: params.id as string,
            applicant_count: response.length,
          });
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user, params.id]);

  const updateStatus = async (applicationId: string, status: string) => {
    if (!user) return;
    setUpdating(applicationId);
    try {
      const updated = await applications.updateStatus(applicationId, { status });
      setJobApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: updated.status } : a))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdating(null);
    }
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
      <Link href={localizePath("/employer", locale)} className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-gray-600">{jobApplications.length} candidate(s) applied</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : jobApplications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No applications yet</p>
            </div>
          ) : (
            <div>
              {candidateAccessLocked && (
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
                    <div>
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

                  {application.coverLetter && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <p className="text-sm text-gray-600 font-medium mb-1">Cover Letter</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {application.coverLetter}
                      </p>
                    </div>
                  )}

                  {application.cvUrl && (
                    <a
                      href={application.cvUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 text-sm mb-4 inline-block"
                    >
                      View CV/Resume
                    </a>
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
                      onClick={() => updateStatus(application.id, "REJECTED")}
                    >
                      Reject
                    </Button>
                  </div>

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
