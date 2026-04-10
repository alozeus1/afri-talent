"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";

type Tone = "professional" | "conversational" | "executive";

const TONES: { value: Tone; label: string; description: string }[] = [
  { value: "professional", label: "Professional", description: "Formal and polished" },
  { value: "conversational", label: "Conversational", description: "Warm and approachable" },
  { value: "executive", label: "Executive", description: "Strategic and senior" },
];

export default function CoverLetterPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [jobId, setJobId] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleGenerate() {
    if (!jobId.trim()) {
      setError("Please enter a Job ID to generate a cover letter.");
      return;
    }
    setLoading(true);
    setError(null);
    setCoverLetter(null);
    try {
      const result = await skills.generateCoverLetter({ jobId: jobId.trim() });
      setCoverLetter(result.coverLetter);
      setSource(result.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate cover letter");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!coverLetter) return;
    await navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Cover Letter Generator</h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate a personalised cover letter tailored to any job in seconds
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Job Details</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job ID <span className="text-gray-400 text-xs">(from the job listing)</span>
              </label>
              <input
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste the job UUID here"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tone</label>
              <div className="grid grid-cols-3 gap-3">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTone(t.value)}
                    className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                      tone === t.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !jobId.trim()}
              className="w-full"
            >
              {loading ? "Generating with Claude..." : "Generate Cover Letter"}
            </Button>
          </CardContent>
        </Card>

        {loading && (
          <Card>
            <CardContent className="p-6">
              <LoadingState lines={8} />
            </CardContent>
          </Card>
        )}

        {coverLetter && !loading && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your Cover Letter</h2>
                <div className="flex items-center gap-2">
                  <Badge variant={source === "ai" ? "success" : "default"}>
                    {source === "ai" ? "AI Generated" : "Template"}
                  </Badge>
                  <Button
                    onClick={handleCopy}
                    className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm px-3 py-1"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    onClick={() => {
                      setCoverLetter(null);
                      setSource(null);
                    }}
                    className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm px-3 py-1"
                  >
                    Regenerate
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                readOnly
                value={coverLetter}
                rows={18}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-2">
                Review and personalise before sending. AI-generated letters should always be
                reviewed.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
