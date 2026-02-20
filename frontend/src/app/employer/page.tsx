"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { jobs, Job } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "default",
  PENDING_REVIEW: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
};

export default function EmployerDashboard() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      jobs
        .myJobs()
        .then(setMyJobs)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const totalApplications = myJobs.reduce((sum, job) => sum + (job._count?.applications || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {user.employer?.companyName || "Employer"} Dashboard
        </h1>
        <p className="text-gray-600">Manage your job postings and review applications</p>
      </div>

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">{myJobs.length}</div>
            <div className="text-gray-600">Total Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {myJobs.filter((j) => j.status === "PUBLISHED").length}
            </div>
            <div className="text-gray-600">Published</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-yellow-600 mb-1">
              {myJobs.filter((j) => j.status === "PENDING_REVIEW").length}
            </div>
            <div className="text-gray-600">Pending Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-600 mb-1">{totalApplications}</div>
            <div className="text-gray-600">Applications</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">My Job Postings</h2>
            <Link href="/employer/jobs/new">
              <Button>Post New Job</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : myJobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You haven&apos;t posted any jobs yet</p>
              <Link href="/employer/jobs/new">
                <Button>Post Your First Job</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {myJobs.map((job) => (
                <div key={job.id} className="py-4 flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{job.title}</span>
                      <Badge variant={statusVariants[job.status] || "default"}>
                        {job.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {job.location} • {job.type} • {job.seniority}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {job._count?.applications || 0} application(s) • Created{" "}
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {job.status === "PUBLISHED" && (
                      <Link href={`/employer/jobs/${job.id}/applications`}>
                        <Button variant="outline" size="sm">
                          View Applications
                        </Button>
                      </Link>
                    )}
                    <Link href={`/jobs/${job.slug}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
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
