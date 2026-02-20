"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { jobs, applications, Job } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchJob() {
      try {
        const data = await jobs.get(params.slug as string);
        setJob(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load job");
      } finally {
        setLoading(false);
      }
    }
    fetchJob();
  }, [params.slug]);

  const handleApply = async () => {
    if (!user) {
      router.push(`/login?redirect=/jobs/${params.slug}`);
      return;
    }

    if (user.role !== "CANDIDATE") {
      setApplyError("Only candidates can apply to jobs");
      return;
    }

    setApplying(true);
    setApplyError(null);

    try {
      await applications.apply({ jobId: job!.id });
      setApplied(true);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const formatSalary = () => {
    if (!job?.salaryMin && !job?.salaryMax) return null;
    const currency = job.currency || "USD";
    const min = job.salaryMin ? `${currency} ${job.salaryMin.toLocaleString()}` : "";
    const max = job.salaryMax ? `${currency} ${job.salaryMax.toLocaleString()}` : "";
    if (min && max) return `${min} - ${max}`;
    return min || max;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
          {error || "Job not found"}
        </div>
        <Link href="/jobs">
          <Button variant="outline">Back to Jobs</Button>
        </Link>
      </div>
    );
  }

  const salary = formatSalary();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/jobs" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Jobs
      </Link>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
                <p className="text-emerald-600 font-semibold text-lg">{job.employer.companyName}</p>
              </div>
              <Badge variant="success" className="text-sm">{job.type}</Badge>
            </div>

            <div className="flex flex-wrap gap-4 mb-6 text-gray-600">
              <span className="inline-flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location}
              </span>
              <span className="inline-flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {job.seniority}
              </span>
              {salary && (
                <span className="inline-flex items-center font-semibold text-gray-900">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {salary}/year
                </span>
              )}
            </div>

            {job.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {job.tags.map((tag) => (
                  <Badge key={tag} variant="default">{tag}</Badge>
                ))}
              </div>
            )}

            <div className="prose max-w-none">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Description</h2>
              <div className="text-gray-600 whitespace-pre-wrap">{job.description}</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Apply for this position</h3>
              
              {applied ? (
                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-4">
                  Application submitted successfully!
                </div>
              ) : user && user.role === "EMPLOYER" ? (
                <div className="bg-blue-50 text-blue-700 p-4 rounded-lg mb-4 text-sm">
                  <p className="font-medium">You&apos;re logged in as an employer.</p>
                  <p className="mt-1">Only candidates can apply to jobs.</p>
                </div>
              ) : user && user.role === "ADMIN" ? (
                <div className="bg-gray-50 text-gray-700 p-4 rounded-lg mb-4 text-sm">
                  <p className="font-medium">You&apos;re logged in as an admin.</p>
                  <p className="mt-1">Admins cannot apply to jobs.</p>
                </div>
              ) : (
                <>
                  {applyError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                      {applyError}
                    </div>
                  )}
                  {!user && (
                    <p className="text-sm text-gray-500 mb-3">
                      Sign in as a candidate to apply for this position.
                    </p>
                  )}
                  <Button
                    className="w-full mb-4"
                    size="lg"
                    onClick={handleApply}
                    disabled={applying}
                  >
                    {applying ? "Applying..." : user ? "Apply Now" : "Sign in to Apply"}
                  </Button>
                  {!user && (
                    <p className="text-xs text-gray-400 text-center">
                      Don&apos;t have an account?{" "}
                      <Link href="/register" className="text-emerald-600 hover:underline">
                        Create one
                      </Link>
                    </p>
                  )}
                </>
              )}

              <div className="border-t border-gray-200 pt-4">
                <h4 className="font-medium text-gray-900 mb-3">About {job.employer.companyName}</h4>
                <p className="text-gray-600 text-sm mb-2">{job.employer.location}</p>
                {job.employer.bio && (
                  <p className="text-gray-600 text-sm mb-3">{job.employer.bio}</p>
                )}
                {job.employer.website && (
                  <a
                    href={job.employer.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 text-sm"
                  >
                    Visit website
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
