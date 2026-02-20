"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function CandidateDashboard() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      applications
        .my()
        .then(setMyApplications)
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user.name}</h1>
        <p className="text-gray-600">Track your job applications and career progress</p>
        <div className="mt-4">
          <Link href="/candidate/ai-assistant">
            <Button variant="outline" size="sm">
              ✦ AI Assistant — match jobs & generate apply packs
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">{myApplications.length}</div>
            <div className="text-gray-600">Total Applications</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {myApplications.filter((a) => a.status === "REVIEWING" || a.status === "SHORTLISTED").length}
            </div>
            <div className="text-gray-600">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {myApplications.filter((a) => a.status === "ACCEPTED").length}
            </div>
            <div className="text-gray-600">Accepted</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">My Applications</h2>
            <Link href="/jobs">
              <Button>Browse Jobs</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : myApplications.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You haven&apos;t applied to any jobs yet</p>
              <Link href="/jobs">
                <Button>Find Jobs</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {myApplications.map((application) => (
                <div key={application.id} className="py-4 flex justify-between items-center">
                  <div>
                    <Link
                      href={`/jobs/${application.job.slug}`}
                      className="font-medium text-gray-900 hover:text-emerald-600"
                    >
                      {application.job.title}
                    </Link>
                    <p className="text-sm text-gray-600">
                      {application.job.employer?.companyName} • {application.job.location}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Applied {new Date(application.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={statusVariants[application.status] || "default"}>
                    {application.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
