"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { jobs, applications, Job } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { QuickApplyModal } from "@/components/jobs/quick-apply-modal";

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
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);

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
                <p className="text-emerald-600 font-semibold text-lg">{job.employer?.companyName || job.sourceName || "Company"}</p>
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

            {(job.visaSponsorship === "YES" || job.relocationAssistance || (job.eligibleCountries && job.eligibleCountries.length > 0)) && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-6 border border-blue-100">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  International Opportunities
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {job.visaSponsorship === "YES" && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">&#10003;</span>
                      <div>
                        <p className="font-medium text-gray-900">Visa Sponsorship</p>
                        <p className="text-sm text-gray-600">Employer provides visa support</p>
                      </div>
                    </div>
                  )}
                  {job.relocationAssistance && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">&#10003;</span>
                      <div>
                        <p className="font-medium text-gray-900">Relocation Assistance</p>
                        <p className="text-sm text-gray-600">Help with moving and settling in</p>
                      </div>
                    </div>
                  )}
                </div>
                {job.eligibleCountries && job.eligibleCountries.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-sm font-medium text-gray-700 mb-2">Eligible Countries:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.eligibleCountries.map((c: string) => (
                        <span key={c} className="px-2 py-0.5 bg-white rounded text-xs font-medium text-gray-700 border border-gray-200">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
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
                    className="w-full mb-3"
                    size="lg"
                    onClick={handleApply}
                    disabled={applying}
                  >
                    {applying ? "Applying..." : user ? "Apply Now" : "Sign in to Apply"}
                  </Button>
                  {user && user.role === "CANDIDATE" && (
                    <Button
                      className="w-full mb-4 bg-emerald-600 text-white hover:bg-emerald-700"
                      size="lg"
                      variant="outline"
                      onClick={() => setQuickApplyOpen(true)}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Quick Apply
                    </Button>
                  )}
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
                <h4 className="font-medium text-gray-900 mb-3">About {job.employer?.companyName || job.sourceName || "Company"}</h4>
                <p className="text-gray-600 text-sm mb-2">{job.employer?.location}</p>
                {job.employer?.bio && (
                  <p className="text-gray-600 text-sm mb-3">{job.employer.bio}</p>
                )}
                {job.employer?.website && (
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

              {/* Interview Insights */}
              {(job.employer?.companyName || job.sourceName) && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Interview Insights
                  </h4>
                  <Link
                    href={`/interviews?company=${encodeURIComponent(job.employer?.companyName || job.sourceName || "")}`}
                    className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    View interview experiences
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}

              {/* Salary Data */}
              {salary && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Salary Data
                  </h4>
                  <Link
                    href={`/salaries?jobTitle=${encodeURIComponent(job.title)}`}
                    className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    Compare salaries for this role
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Apply Modal */}
      {user && user.role === "CANDIDATE" && job && (
        <QuickApplyModal
          jobId={job.id}
          jobTitle={job.title}
          isOpen={quickApplyOpen}
          onClose={() => setQuickApplyOpen(false)}
          onSuccess={() => {
            setQuickApplyOpen(false);
            setApplied(true);
          }}
        />
      )}
    </div>
  );
}
