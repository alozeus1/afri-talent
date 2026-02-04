"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { applications, Application } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

export default function JobApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [jobApplications, setJobApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token && user?.role === "EMPLOYER") {
      applications
        .forJob(params.id as string, token)
        .then(setJobApplications)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token, user, params.id]);

  const updateStatus = async (applicationId: string, status: string) => {
    if (!token) return;
    setUpdating(applicationId);
    try {
      const updated = await applications.updateStatus(applicationId, { status }, token);
      setJobApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, status: updated.status } : a))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdating(null);
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
      <Link href="/employer" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
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
                      disabled={updating === application.id || application.status === "REVIEWING"}
                      onClick={() => updateStatus(application.id, "REVIEWING")}
                    >
                      Mark Reviewing
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updating === application.id || application.status === "SHORTLISTED"}
                      onClick={() => updateStatus(application.id, "SHORTLISTED")}
                    >
                      Shortlist
                    </Button>
                    <Button
                      size="sm"
                      disabled={updating === application.id || application.status === "ACCEPTED"}
                      onClick={() => updateStatus(application.id, "ACCEPTED")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={updating === application.id || application.status === "REJECTED"}
                      onClick={() => updateStatus(application.id, "REJECTED")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
