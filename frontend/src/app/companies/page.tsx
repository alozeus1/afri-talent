"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Company {
  id: string;
  companyName: string;
  industry: string | null;
  headquarters: string | null;
  website: string | null;
  size: string | null;
  hiresFromAfrica: boolean;
  verified: boolean;
  profileType?: "COMPANY" | "EMPLOYER";
  jobCount?: number;
  logoUrl?: string | null;
  brandColor?: string | null;
  trustBadge?: string | null;
  ratingAggregate: {
    averageOverall: number | null;
    totalReviews: number;
  } | null;
}

interface CompanyListResponse {
  companies: Company[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const candidateActions = [
  { label: "Browse verified job listings", href: "/jobs" },
  { label: "Search remote roles", href: "/jobs?remote=true" },
  { label: "Use visa-friendly filters", href: "/jobs?visaSponsorship=true" },
  { label: "Set alert preferences", href: "/candidate/preferences" },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${
            star <= Math.round(rating) ? "text-yellow-400" : "text-gray-300"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-gray-600">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function CompaniesPage() {
  const t = useT();
  const [data, setData] = useState<CompanyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("page", page.toString());
      params.set("limit", "12");
      const query = params.toString();

      const res = await fetch(`${API_URL}/api/companies${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load companies");
      const json: CompanyListResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCompanies();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchCompanies]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-zinc-950 px-6 py-20 text-center shadow-2xl mb-12 animate-gradient-breath">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <Badge className="mb-6 bg-white/10 text-emerald-100 hover:bg-white/20 border-white/20 backdrop-blur-md">
            {t("companies.employerDirBeta")}
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight font-display">
            {t("companies.heroHeading")} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">
              {t("companies.heroHighlight")}
            </span>
          </h1>
          <p className="text-lg md:text-xl text-emerald-50/80 mb-8 max-w-2xl mx-auto">
            {t("companies.heroDesc")}
          </p>
          <div className="max-w-xl mx-auto">
            <Input
              placeholder={t("companies.searchPlaceholder")}
              value={search}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12 rounded-xl focus:bg-white/20 focus:ring-emerald-400 backdrop-blur-md"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">{error}</div>
      )}

      {!loading && data && (
        <>
          <div className="mb-4 text-gray-600">
            {data.pagination.total} compan{data.pagination.total !== 1 ? "ies" : "y"} found
          </div>

          {data.companies.length === 0 ? (
            <div className="py-8">
              <div className="text-center py-16 px-4 surface-panel bg-white shadow-sm border border-zinc-200 dark:bg-zinc-900/50 dark:border-zinc-800 rounded-2xl mb-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-6 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                  {search ? t("companies.noCompaniesFound") : t("companies.directoryUpdating")}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                  {search
                    ? t("companies.noCompaniesDesc")
                    : t("companies.directoryDesc")}
                </p>
                {search && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    aria-label="Clear current search query to view all companies"
                  >
                    {t("companies.clearSearch")}
                  </Button>
                )}
              </div>

              {!search && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {candidateActions.map((action) => (
                    <Link key={action.href} href={action.href}>
                      <Card className="h-full interactive-card transition-all duration-200">
                        <CardContent className="p-5">
                          <Badge variant="info">Available now</Badge>
                          <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                            {action.label}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                            Use candidate-side tools while verified employer profiles are onboarded.
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.companies.map((company) => (
                <Link key={company.id} href={`/companies/${company.id}`}>
                  <Card className="h-full hover:shadow-md transition-all duration-200 hover:-translate-y-1 cursor-pointer">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            {company.logoUrl ? (
                              <img
                                src={company.logoUrl}
                                alt={`${company.companyName} logo`}
                                className="h-10 w-10 rounded-lg border border-gray-200 object-contain"
                              />
                            ) : (
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
                                style={{ backgroundColor: company.brandColor || "#0f766e" }}
                              >
                                {company.companyName.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-gray-900">
                                {company.companyName}
                              </h3>
                              {company.industry && (
                                <p className="text-sm text-gray-600">{company.industry}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        {company.verified && (
                          <Badge variant="info" className="ml-2 shrink-0">Verified</Badge>
                        )}
                      </div>

                      {company.headquarters && (
                        <p className="text-sm text-gray-500 mb-3">
                          📍 {company.headquarters}
                        </p>
                      )}

                      {company.ratingAggregate && company.ratingAggregate.totalReviews > 0 &&
                        company.ratingAggregate.averageOverall != null && (
                        <div className="mb-3">
                          <StarRating rating={company.ratingAggregate.averageOverall} />
                          <p className="text-xs text-gray-500 mt-1">
                            {company.ratingAggregate.totalReviews} review
                            {company.ratingAggregate.totalReviews !== 1 ? "s" : ""}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-auto">
                        {company.hiresFromAfrica && (
                          <Badge variant="success">Hires from Africa</Badge>
                        )}
                        {company.profileType === "EMPLOYER" && (
                          <Badge variant="info">{company.trustBadge ?? "Registered employer"}</Badge>
                        )}
                        {(company.jobCount ?? 0) > 0 && (
                          <Badge>{company.jobCount} open role{company.jobCount === 1 ? "" : "s"}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mb-16">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("common.previous")}
              </Button>
              <span className="flex items-center px-4 text-gray-600">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          )}

          {/* Honest early-access employer proof */}
          {!search && (
            <div className="mt-16 pt-16 border-t border-gray-100 dark:border-zinc-800">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4 font-display">
                  {t("companies.trustComingTitle")}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  {t("companies.trustComingDesc")}
                </p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                {["Employer verification", "Candidate safety", "Pilot stories"].map((item) => (
                  <Card key={item} className="interactive-card bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item}</h3>
                      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        {item === "Employer verification"
                          ? "Profiles should show verified domains, application paths, and hiring expectations before public promotion."
                          : item === "Candidate safety"
                            ? "Candidates should see source transparency, scam-risk guidance, and clear next steps before applying."
                            : "Testimonials and case studies should require real workflow completion and explicit permission."}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
