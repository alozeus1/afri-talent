"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";

interface GapResult {
  explanation: string;
  framing: string;
  talkingPoints: string[];
  source: "ai" | "template";
}

export default function CareerGapPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [gapStartDate, setGapStartDate] = useState("");
  const [gapEndDate, setGapEndDate] = useState("");
  const [activities, setActivities] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [result, setResult] = useState<GapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSubmit() {
    if (!gapStartDate || !gapEndDate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await skills.explainCareerGap({
        gapStartDate,
        gapEndDate,
        activities: activities.trim() || undefined,
        targetRole: targetRole.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to explain career gap");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setGapStartDate("");
    setGapEndDate("");
    setActivities("");
    setTargetRole("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Career Gap Explainer</h1>
            <p className="text-sm text-gray-500 mt-1">
              Turn employment gaps into a strength with AI-powered framing
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!result && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Gap Details</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gap Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={gapStartDate}
                    onChange={(e) => setGapStartDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gap End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={gapEndDate}
                    onChange={(e) => setGapEndDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What were you doing?{" "}
                  <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </label>
                <textarea
                  value={activities}
                  onChange={(e) => setActivities(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="e.g. Caring for family, freelancing, studying, health reasons"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Role{" "}
                  <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Product Manager"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading || !gapStartDate || !gapEndDate}
                className="w-full"
              >
                {loading ? "Generating explanation..." : "Explain My Gap"}
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="p-6">
              <LoadingState lines={8} />
            </CardContent>
          </Card>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={result.source === "ai" ? "success" : "default"}>
                  {result.source === "ai" ? "AI Generated" : "Template"}
                </Badge>
              </div>
              <Button
                onClick={handleReset}
                className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm px-4 py-2"
              >
                Try Another Gap
              </Button>
            </div>

            {/* Framing */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-700 uppercase tracking-wide text-xs">
                  Framing
                </h2>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed bg-gray-50 rounded-md px-4 py-3 text-sm font-medium">
                  {result.framing}
                </p>
              </CardContent>
            </Card>

            {/* Full Explanation */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Full Explanation</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed">{result.explanation}</p>
              </CardContent>
            </Card>

            {/* Talking Points */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Talking Points</h2>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {result.talkingPoints.map((point, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-700">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed pt-0.5">{point}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
