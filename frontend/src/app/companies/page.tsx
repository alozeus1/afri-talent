"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  ratingAggregate: {
    averageOverall: number;
    reviewCount: number;
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

const FEATURED_COMPANIES: Company[] = [
  {
    id: "featured-1",
    companyName: "Paystack",
    industry: "Financial Services",
    headquarters: "Lagos, Nigeria",
    website: "https://paystack.com",
    size: "501-1000",
    hiresFromAfrica: true,
    verified: true,
    ratingAggregate: { averageOverall: 4.8, reviewCount: 124 }
  },
  {
    id: "featured-2",
    companyName: "Andela",
    industry: "Technology",
    headquarters: "New York, USA",
    website: "https://andela.com",
    size: "1000+",
    hiresFromAfrica: true,
    verified: true,
    ratingAggregate: { averageOverall: 4.5, reviewCount: 312 }
  },
  {
    id: "featured-3",
    companyName: "Flutterwave",
    industry: "Financial Services",
    headquarters: "San Francisco, USA",
    website: "https://flutterwave.com",
    size: "501-1000",
    hiresFromAfrica: true,
    verified: true,
    ratingAggregate: { averageOverall: 4.6, reviewCount: 208 }
  }
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
            Verified Tech Employers
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight font-display">
            The World&apos;s Best Companies <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-200">
              Hire African Talent
            </span>
          </h1>
          <p className="text-lg md:text-xl text-emerald-50/80 mb-8 max-w-2xl mx-auto">
            Discover verified companies that offer visa sponsorship, remote flexibility, and transparent compensation.
          </p>
          <div className="max-w-xl mx-auto">
            <Input
              placeholder="Search companies by name or industry..."
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
                  {search ? "No companies found" : "Directory is being updated"}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                  {search 
                    ? `We couldn't find any companies matching "${search}". Try adjusting your search terms.`
                    : "We're currently onboarding new partners to the AfriTalent platform. Check out some of our featured companies below."}
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
                    Clear search
                  </Button>
                )}
              </div>

              {!search && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Featured Companies</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {FEATURED_COMPANIES.map((company) => (
                      <Link key={company.id} href={`/companies/${company.id}`}>
                        <Card className="h-full hover:shadow-md transition-all duration-200 hover:-translate-y-1 cursor-pointer">
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 text-lg truncate">
                                  {company.companyName}
                                </h3>
                                {company.industry && (
                                  <p className="text-sm text-gray-600">{company.industry}</p>
                                )}
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

                            {company.ratingAggregate && company.ratingAggregate.reviewCount > 0 && (
                              <div className="mb-3">
                                <StarRating rating={company.ratingAggregate.averageOverall} />
                                <p className="text-xs text-gray-500 mt-1">
                                  {company.ratingAggregate.reviewCount} review
                                  {company.ratingAggregate.reviewCount !== 1 ? "s" : ""}
                                </p>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-auto pt-4">
                              {company.hiresFromAfrica && (
                                <Badge variant="success">Hires from Africa</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
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
                          <h3 className="font-semibold text-gray-900 text-lg truncate">
                            {company.companyName}
                          </h3>
                          {company.industry && (
                            <p className="text-sm text-gray-600">{company.industry}</p>
                          )}
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

                      {company.ratingAggregate && company.ratingAggregate.reviewCount > 0 && (
                        <div className="mb-3">
                          <StarRating rating={company.ratingAggregate.averageOverall} />
                          <p className="text-xs text-gray-500 mt-1">
                            {company.ratingAggregate.reviewCount} review
                            {company.ratingAggregate.reviewCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-auto">
                        {company.hiresFromAfrica && (
                          <Badge variant="success">Hires from Africa</Badge>
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
                Previous
              </Button>
              <span className="flex items-center px-4 text-gray-600">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}

          {/* Wall of Love / Testimonials */}
          {!search && (
            <div className="mt-16 pt-16 border-t border-gray-100 dark:border-zinc-800">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4 font-display">
                  Loved by Global Teams
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  See what engineering leaders and founders say about scaling their teams with AfriTalent.
                </p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:shadow-lg transition-shadow">
                  <CardContent className="p-8">
                    <StarRating rating={5} />
                    <p className="text-gray-700 dark:text-gray-300 my-6 italic leading-relaxed">
                      &quot;The caliber of senior engineers we found through AfriTalent exceeded our expectations. Our Lagos hub is now our fastest-growing engineering center globally.&quot;
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">SJ</div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Sarah Jenkins</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">VP Engineering, FintechX</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:shadow-lg transition-shadow">
                  <CardContent className="p-8">
                    <StarRating rating={5} />
                    <p className="text-gray-700 dark:text-gray-300 my-6 italic leading-relaxed">
                      &quot;We struggled with visa sponsorships and relocations before. AfriTalent&apos;s verified partners made building our distributed team in Kenya completely frictionless.&quot;
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">MD</div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Marcus Dawson</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">CTO, CloudScale</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:shadow-lg transition-shadow">
                  <CardContent className="p-8">
                    <StarRating rating={5} />
                    <p className="text-gray-700 dark:text-gray-300 my-6 italic leading-relaxed">
                      &quot;Not only did we hire two incredible staff-level backend engineers, but the salary transparency tools helped us create fair, globally competitive compensation packages.&quot;
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">AK</div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Aisha K.</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Head of Talent, NextWeb</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
