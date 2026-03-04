"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { applications, Application, billing, BillingStatus } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CandidateProfile {
  id: string;
  headline: string;
  bio: string;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience: number | null;
  visaStatus: string;
  openToWork: boolean;
  profileCompleteness: number;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

function getMissingItems(profile: CandidateProfile): string[] {
  const missing: string[] = [];
  if (!profile.headline) missing.push("Add a headline");
  if (!profile.bio) missing.push("Add a bio");
  if (!profile.skills || profile.skills.length === 0) missing.push("Add skills");
  if (!profile.targetRoles || profile.targetRoles.length === 0) missing.push("Add target roles");
  if (!profile.targetCountries || profile.targetCountries.length === 0) missing.push("Add target countries");
  if (profile.yearsExperience === null || profile.yearsExperience === undefined) missing.push("Add years of experience");
  if (!profile.linkedinUrl) missing.push("Add LinkedIn URL");
  if (!profile.githubUrl) missing.push("Add GitHub URL");
  if (!profile.portfolioUrl) missing.push("Add portfolio URL");
  return missing;
}

const planLabels: Record<string, string> = {
  FREE: "Free",
  BASIC: "Basic",
  PROFESSIONAL: "Professional",
};

export default function CandidateDashboard() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [openToWork, setOpenToWork] = useState(false);
  const [togglingOtw, setTogglingOtw] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);

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

      // Fetch profile
      fetch(`${API_URL}/api/profile`, { credentials: "include" })
        .then((res) => res.json())
        .then((data: CandidateProfile) => {
          setProfile(data);
          setOpenToWork(data.openToWork);
        })
        .catch(console.error);

      // Fetch billing status
      billing
        .status()
        .then(setBillingStatus)
        .catch(console.error);
    }
  }, [user]);

  const toggleOpenToWork = async () => {
    setTogglingOtw(true);
    const newValue = !openToWork;
    try {
      await fetch(`${API_URL}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ openToWork: newValue }),
      });
      setOpenToWork(newValue);
    } catch (err) {
      console.error("Failed to update open-to-work status", err);
    } finally {
      setTogglingOtw(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const completeness = profile?.profileCompleteness ?? 0;
  const missingItems = profile ? getMissingItems(profile) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user.name}</h1>
        <p className="text-gray-600">Track your job applications and career progress</p>
      </div>

      {/* Profile Completeness + Open to Work + Subscription */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Profile Completeness */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Profile Completeness</h3>
            <div className="flex items-center gap-4 mb-3">
              <div className="relative h-16 w-16 flex-shrink-0">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15.9155"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18" cy="18" r="15.9155"
                    fill="none"
                    stroke={completeness >= 80 ? "#059669" : "#f59e0b"}
                    strokeWidth="3"
                    strokeDasharray={`${completeness} ${100 - completeness}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
                  {completeness}%
                </span>
              </div>
              <div className="min-w-0">
                {completeness >= 80 ? (
                  <p className="text-sm text-emerald-700 font-medium">Profile looks great!</p>
                ) : (
                  <Link href="/candidate/profile">
                    <Button size="sm">Complete your profile</Button>
                  </Link>
                )}
              </div>
            </div>
            {completeness < 80 && missingItems.length > 0 && (
              <ul className="space-y-1">
                {missingItems.slice(0, 3).map((item) => (
                  <li key={item} className="text-xs text-gray-500 flex items-center gap-1">
                    <span className="text-amber-500">•</span> {item}
                  </li>
                ))}
                {missingItems.length > 3 && (
                  <li className="text-xs text-gray-400">+{missingItems.length - 3} more</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Open to Work Toggle */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Job Visibility</h3>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={toggleOpenToWork}
                disabled={togglingOtw}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  openToWork ? "bg-emerald-600" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  openToWork ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
              <span className="text-sm font-medium text-gray-900">
                {openToWork ? "Open to Work" : "Not Looking"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {openToWork ? "Visible to employers" : "Hidden from employers"}
            </p>
          </CardContent>
        </Card>

        {/* Subscription Status */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Subscription</h3>
            {billingStatus ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={billingStatus.plan === "FREE" ? "default" : "success"}>
                    {planLabels[billingStatus.plan] || billingStatus.plan}
                  </Badge>
                  {billingStatus.status === "ACTIVE" && billingStatus.plan !== "FREE" && (
                    <span className="text-xs text-emerald-600 font-medium">Active</span>
                  )}
                </div>
                {billingStatus.plan === "FREE" && (
                  <Link href="/billing">
                    <Button size="sm" variant="outline" className="mt-1">Upgrade Plan</Button>
                  </Link>
                )}
                {billingStatus.plan !== "FREE" && billingStatus.currentPeriodEnd && (
                  <p className="text-xs text-gray-500 mt-1">
                    Renews {new Date(billingStatus.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
              </>
            ) : (
              <div className="animate-pulse h-6 w-24 bg-gray-200 rounded"></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link href="/candidate/ai-assistant">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">✦</span>
              <span className="text-sm font-medium text-gray-900">AI Assistant</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/messages">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">💬</span>
              <span className="text-sm font-medium text-gray-900">Messages</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/jobs">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">🔍</span>
              <span className="text-sm font-medium text-gray-900">Saved Searches</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/billing">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">💳</span>
              <span className="text-sm font-medium text-gray-900">Billing</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stat Cards */}
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

      {/* My Applications */}
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
