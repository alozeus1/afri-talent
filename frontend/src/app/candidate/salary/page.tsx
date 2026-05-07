"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";

interface NegotiationResult {
  recommendedRange: string;
  talkingPoints: string[];
  benefitsToNegotiate: string[];
  negotiationScript: string;
  source: "ai" | "template";
}

const CURRENCIES = ["USD", "NGN", "KES", "ZAR", "GHS", "GBP", "EUR"];

export default function SalaryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [yearsExperience, setYearsExperience] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [targetSalary, setTargetSalary] = useState("");
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (authLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleSubmit() {
    if (!role.trim() || !location.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await skills.getSalaryNegotiation({
        role: role.trim(),
        location: location.trim(),
        currency,
        yearsExperience: yearsExperience ? Number(yearsExperience) : undefined,
        currentSalary: currentSalary ? Number(currentSalary) : undefined,
        targetSalary: targetSalary ? Number(targetSalary) : undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate negotiation guide");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.negotiationScript) return;
    await navigator.clipboard.writeText(result.negotiationScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setRole("");
    setLocation("");
    setCurrency("USD");
    setYearsExperience("");
    setCurrentSalary("");
    setTargetSalary("");
    setResult(null);
    setError(null);
    setCopied(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Salary Negotiation Guide</h1>
            <p className="text-sm text-gray-500 mt-1">
              Get market-aware negotiation scripts for African and global markets
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
              <h2 className="text-lg font-semibold">Your Details</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role / Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Lagos, Nigeria"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Years of Experience{" "}
                    <span className="text-gray-400 text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current / Offered Salary{" "}
                    <span className="text-gray-400 text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={currentSalary}
                    onChange={(e) => setCurrentSalary(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 150000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Salary{" "}
                    <span className="text-gray-400 text-xs font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={targetSalary}
                    onChange={(e) => setTargetSalary(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 180000"
                  />
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={loading || !role.trim() || !location.trim()}
                className="w-full"
              >
                {loading ? "Generating guide..." : "Generate Negotiation Guide"}
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
              <Badge variant={result.source === "ai" ? "success" : "default"}>
                {result.source === "ai" ? "AI Generated" : "Template"}
              </Badge>
              <Button
                onClick={handleReset}
                className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm px-4 py-2"
              >
                Start Over
              </Button>
            </div>

            {/* Recommended Range */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <h2 className="text-base font-semibold text-green-800 uppercase tracking-wide text-xs">
                  Recommended Range
                </h2>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700">{result.recommendedRange}</p>
                <p className="text-sm text-green-600 mt-1">
                  Based on {role} in {location} ({currency})
                </p>
              </CardContent>
            </Card>

            {/* Talking Points */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Talking Points</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.talkingPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                      <span className="leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Benefits to Negotiate */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900">Benefits to Negotiate</h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.benefitsToNegotiate.map((benefit, i) => (
                    <Badge key={i} variant="info">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Negotiation Script */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900">Negotiation Script</h2>
                  <Button
                    onClick={handleCopy}
                    className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm px-3 py-1"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  readOnly
                  value={result.negotiationScript}
                  rows={12}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  Adapt this script to your own voice and specific situation before using it.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
