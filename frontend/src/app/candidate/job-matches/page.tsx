"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { skills, JobMatch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";

const scoreVariant = (score: number): "success" | "info" | "warning" | "danger" | "default" => {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 40) return "warning";
  return "default";
};

const riskVariant = (level?: string): "danger" | "warning" | "default" => {
  if (level === "HIGH" || level === "CRITICAL") return "danger";
  if (level === "MEDIUM") return "warning";
  return "default";
};

const qualityVariant = (label?: string): "success" | "info" | "warning" | "default" => {
  if (label === "TRUSTED") return "success";
  if (label === "SOLID") return "info";
  if (label === "REVIEW") return "warning";
  return "default";
};

export default function JobMatchesPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [embedding, setEmbedding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [embedMsg, setEmbedMsg] = useState<string | null>(null);
  const [filterVisa, setFilterVisa] = useState(false);
  const [filterRemote, setFilterRemote] = useState(false);

  const filteredMatches = matches.filter((m) => {
    if (filterVisa && m.visaSponsorship !== "YES") return false;
    if (filterRemote && !m.location?.toLowerCase().includes("remote")) return false;
    return true;
  });

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await skills.getJobMatches(10);
      setMatches(data.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    void loadMatches();
  }, [user, loadMatches, router]);

  async function handleReEmbed() {
    setEmbedding(true);
    setEmbedMsg(null);
    try {
      const data = await skills.embedResume();
      setEmbedMsg(data.message);
      await loadMatches();
    } catch (err) {
      setEmbedMsg(err instanceof Error ? err.message : "Embedding failed");
    } finally {
      setEmbedding(false);
    }
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Job Matches</h1>
            <p className="text-sm text-gray-500 mt-1">
              Jobs ranked by semantic similarity to your resume
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <button
                onClick={() => setFilterVisa(!filterVisa)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterVisa ? "bg-green-100 border-green-400 text-green-800" : "border-gray-300 text-gray-600"}`}
              >
                Visa Sponsorship
              </button>
              <button
                onClick={() => setFilterRemote(!filterRemote)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterRemote ? "bg-blue-100 border-blue-400 text-blue-800" : "border-gray-300 text-gray-600"}`}
              >
                Remote Only
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Premium</Badge>
            <Button
              onClick={handleReEmbed}
              disabled={embedding}
              className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm"
            >
              {embedding ? "Updating..." : "Refresh Matches"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error === "No resume found. Generate one first." ? (
              <span>
                {error}{" "}
                <Link href="/candidate/resume-builder" className="font-medium underline">
                  Build your resume →
                </Link>
              </span>
            ) : (
              error
            )}
          </div>
        )}

        {embedMsg && (
          <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-700">
            {embedMsg}
          </div>
        )}

        {filteredMatches.length === 0 && !error ? (
          <Card>
            <CardContent className="py-12 text-center">
              {matches.length > 0 ? (
                <>
                  <p className="text-gray-500">No matches for the active filters.</p>
                  <p className="text-sm text-gray-400 mt-1">Try removing a filter above.</p>
                </>
              ) : (
                <>
                  <p className="text-gray-500">No matches yet.</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Save a resume first, then click{" "}
                    <span className="font-medium">Refresh Matches</span>.
                  </p>
                  <Link href="/candidate/resume-builder">
                    <Button className="mt-4">Build Resume</Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredMatches.map((match) => (
              <Card key={match.jobId} data-testid="job-match-card">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/jobs/${match.slug}`}
                        className="font-semibold text-gray-900 hover:text-blue-600 truncate block"
                      >
                        {match.title}
                      </Link>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {match.company} · {match.location}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="default">{match.type}</Badge>
                        <Badge variant="default">{match.seniority}</Badge>
                        {match.matchMethod === "vector" && (
                          <Badge variant="info">Semantic match</Badge>
                        )}
                        {match.verifiedEmployer && (
                          <Badge
                            variant="success"
                            data-testid="verified-employer-badge"
                          >
                            ✓ Verified employer
                          </Badge>
                        )}
                      </div>
                      {/* Risk + Quality indicators */}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {match.riskLevel && (match.riskLevel === "HIGH" || match.riskLevel === "CRITICAL") && (
                          <Badge variant={riskVariant(match.riskLevel)} className="text-xs">Risk: {match.riskLevel}</Badge>
                        )}
                        {match.qualityLabel && (
                          <Badge variant={qualityVariant(match.qualityLabel)} className="text-xs">{match.qualityLabel}</Badge>
                        )}
                        {match.visaSponsorship === "YES" && (
                          <Badge variant="success" className="text-xs">Visa OK</Badge>
                        )}
                      </div>

                      {/* AI Explanation */}
                      {match.explanation && (
                        <p
                          className="mt-2 text-xs text-gray-500 italic"
                          data-testid="match-explanation"
                        >
                          {match.explanation}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant={scoreVariant(match.score)}>
                        {match.score}% match
                      </Badge>
                      <Link href={`/jobs/${match.slug}`}>
                        <Button className="text-sm">View Job</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
