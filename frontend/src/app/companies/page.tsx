"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";

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

const candidateActions: Array<{ label: PublicMessageKey; href: string }> = [
  { label: "discover.companies.action.browse", href: "/jobs" },
  { label: "discover.companies.action.remote", href: "/jobs?remote=true" },
  { label: "discover.companies.action.visa", href: "/jobs?visaSponsorship=YES" },
  { label: "discover.companies.action.alerts", href: "/candidate/preferences" },
];

const TRUST_PROOF: Array<{ title: PublicMessageKey; body: PublicMessageKey }> = [
  { title: "discover.companies.proof.verificationTitle", body: "discover.companies.proof.verificationBody" },
  { title: "discover.companies.proof.safetyTitle", body: "discover.companies.proof.safetyBody" },
  { title: "discover.companies.proof.storiesTitle", body: "discover.companies.proof.storiesBody" },
];

function StarRating({ rating }: { rating: number }) {
  const tp = usePublicT();
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={tp("discover.companies.rating", { rating: rating.toFixed(1) })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${
            star <= Math.round(rating) ? "text-amber-400" : "text-fg-muted/40"
          }`}
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ms-1 text-sm text-fg-secondary" aria-hidden="true">{rating.toFixed(1)}</span>
    </div>
  );
}

export default function CompaniesPage() {
  const t = useT();
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();
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
      if (!res.ok) throw new Error(tp("discover.companies.loadError"));
      const json: CompanyListResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("discover.companies.loadError"));
    } finally {
      setLoading(false);
    }
    // tp only formats copy; refetching on locale change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" aria-hidden="true"></div>
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
              type="search"
              aria-label={t("companies.searchPlaceholder")}
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
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true" aria-label={tp("discover.companies.loading")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-line bg-surface-muted" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-danger">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void fetchCompanies()}>
            {tp("site.error.retry")}
          </Button>
        </div>
      )}

      {!loading && data && (
        <>
          <p className="mb-4 text-fg-secondary" aria-live="polite">
            {tp("discover.companies.count", { count: data.pagination.total })}
          </p>

          {data.companies.length === 0 ? (
            <div className="py-8">
              <div className="text-center py-16 px-4 surface-panel bg-surface shadow-sm border border-line rounded-2xl mb-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-soft text-primary-text mb-6">
                  <svg aria-hidden="true" className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-fg mb-3">
                  {search ? t("companies.noCompaniesFound") : t("companies.directoryUpdating")}
                </h2>
                <p className="text-fg-secondary max-w-md mx-auto mb-8">
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
                    aria-label={tp("discover.companies.clearAria")}
                  >
                    {t("companies.clearSearch")}
                  </Button>
                )}
              </div>

              {!search && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {candidateActions.map((action) => (
                    <Link key={action.href} href={localizePath(action.href, locale)}>
                      <Card className="h-full interactive-card transition-all duration-200">
                        <CardContent className="p-5">
                          <Badge variant="info">{tp("discover.companies.availableNow")}</Badge>
                          <h3 className="mt-4 text-base font-semibold text-fg">{tp(action.label)}</h3>
                          <p className="mt-2 text-sm leading-6 text-fg-secondary">{tp("discover.companies.actionBody")}</p>
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
                <Link key={company.id} href={localizePath(`/companies/${company.id}`, locale)} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <Card className="h-full cursor-pointer transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-raised">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            {company.logoUrl ? (
                              // Employer-supplied logo URLs come from arbitrary hosts, so next/image is not used.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={company.logoUrl}
                                alt={tp("discover.companies.logoAlt", { name: company.companyName })}
                                loading="lazy"
                                className="h-10 w-10 rounded-lg border border-line object-contain"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
                                style={{ backgroundColor: company.brandColor || "#0f766e" }}
                              >
                                {company.companyName.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-fg">
                                {company.companyName}
                              </h3>
                              {company.industry && (
                                <p className="text-sm text-fg-secondary">{company.industry}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        {company.verified && (
                          <Badge variant="info" className="ms-2 shrink-0">{tp("discover.detail.verified")}</Badge>
                        )}
                      </div>

                      {company.headquarters && (
                        <p className="text-sm text-fg-muted mb-3">
                          <span aria-hidden="true">📍</span> {company.headquarters}
                        </p>
                      )}

                      {company.ratingAggregate && company.ratingAggregate.totalReviews > 0 &&
                        company.ratingAggregate.averageOverall != null && (
                        <div className="mb-3">
                          <StarRating rating={company.ratingAggregate.averageOverall} />
                          <p className="text-xs text-fg-muted mt-1">
                            {tp("discover.companies.reviews", { count: company.ratingAggregate.totalReviews })}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-auto">
                        {company.hiresFromAfrica && (
                          <Badge variant="success">{tp("discover.badge.hiresFromAfrica")}</Badge>
                        )}
                        {company.profileType === "EMPLOYER" && (
                          <Badge variant="info">{company.trustBadge ? label(company.trustBadge) : tp("discover.companies.registered")}</Badge>
                        )}
                        {(company.jobCount ?? 0) > 0 && (
                          <Badge>{tp("discover.companies.roles", { count: company.jobCount ?? 0 })}</Badge>
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
              <span className="flex items-center px-4 text-fg-secondary">
                {tp("discover.page.of", { page, total: data.pagination.totalPages })}
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
            <div className="mt-16 pt-16 border-t border-line">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-fg mb-4 font-display">
                  {t("companies.trustComingTitle")}
                </h2>
                <p className="text-fg-secondary max-w-2xl mx-auto">
                  {t("companies.trustComingDesc")}
                </p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-3">
                {TRUST_PROOF.map((item) => (
                  <Card key={item.title} className="interactive-card bg-surface border-line">
                    <CardContent className="p-6">
                      <h3 className="font-semibold text-fg">{tp(item.title)}</h3>
                      <p className="mt-3 text-sm leading-6 text-fg-secondary">{tp(item.body)}</p>
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
