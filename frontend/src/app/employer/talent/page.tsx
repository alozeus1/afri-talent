"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { talent, TalentSearchResponse } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TalentMarketplacePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [data, setData] = useState<TalentSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const fetchTalent = useCallback(async () => {
    if (!user || user.role !== "EMPLOYER") return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: 12 };
      if (skills) params.skills = skills;
      if (location) params.location = location;
      if (minExperience) params.minExperience = parseInt(minExperience);
      const response = await talent.search(params) as TalentSearchResponse;
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [user, skills, location, minExperience, page]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      const debounce = setTimeout(() => {
        fetchTalent();
      }, 300);
      return () => clearTimeout(debounce);
    }
  }, [fetchTalent, user]);

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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Talent Marketplace</h1>
        <p className="text-gray-600">
          Discover skilled African professionals for your team
        </p>
      </div>

      {/* Search Filters */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Skills (e.g. React, Python)"
              value={skills}
              onChange={(e) => {
                setSkills(e.target.value);
                setPage(1);
              }}
            />
            <Input
              placeholder="Location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            />
            <div>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                value={minExperience}
                onChange={(e) => {
                  setMinExperience(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Min Experience</option>
                <option value="1">1+ years</option>
                <option value="2">2+ years</option>
                <option value="3">3+ years</option>
                <option value="5">5+ years</option>
                <option value="8">8+ years</option>
                <option value="10">10+ years</option>
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSkills("");
                setLocation("");
                setMinExperience("");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

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
            {data.pagination.total} candidate{data.pagination.total !== 1 ? "s" : ""} found
          </div>

          {data.candidates.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-gray-600 mb-2 font-medium">No candidates match your criteria</p>
              <p className="text-gray-500 text-sm">Try adjusting your filters to see more results</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.candidates.map((candidate) => (
                <Card key={candidate.user.id} className="h-full">
                  <CardContent className="p-6">
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {candidate.user.name}
                      </h3>
                      {candidate.headline && (
                        <p className="text-sm text-gray-600 mt-1">{candidate.headline}</p>
                      )}
                    </div>

                    {/* Skills */}
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {candidate.skills.slice(0, 5).map((skill) => (
                          <Badge key={skill} variant="default">{skill}</Badge>
                        ))}
                        {candidate.skills.length > 5 && (
                          <Badge variant="default">+{candidate.skills.length - 5}</Badge>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 text-sm text-gray-600 mb-3">
                      {candidate.yearsExperience != null && (
                        <p>💼 {candidate.yearsExperience} years experience</p>
                      )}
                      {candidate.targetCountries && candidate.targetCountries.length > 0 && (
                        <p>🌍 {candidate.targetCountries.join(", ")}</p>
                      )}
                      {candidate.visaStatus && (
                        <p>📋 Visa: {candidate.visaStatus}</p>
                      )}
                    </div>

                    {/* Profile Completeness */}
                    {candidate.profileCompleteness != null && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Profile completeness</span>
                          <span>{candidate.profileCompleteness}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              candidate.profileCompleteness >= 80
                                ? "bg-emerald-500"
                                : candidate.profileCompleteness >= 50
                                  ? "bg-yellow-500"
                                  : "bg-red-400"
                            }`}
                            style={{ width: `${candidate.profileCompleteness}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Link href={`/candidate/${candidate.user.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          View Profile
                        </Button>
                      </Link>
                      <Link href="/messages" className="flex-1">
                        <Button size="sm" className="w-full">
                          Message
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2">
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
        </>
      )}
    </div>
  );
}
