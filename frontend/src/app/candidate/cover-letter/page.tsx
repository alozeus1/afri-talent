"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { buildFallbackCoverLetter } from "@/lib/early-tester-content";

type Tone = "professional" | "conversational" | "executive" | "confident" | "short" | "entry" | "senior";

const TONES: { value: Tone; apiTone: "professional" | "conversational" | "executive"; label: string; description: string }[] = [
  { value: "professional", apiTone: "professional", label: "Professional", description: "Formal and polished" },
  { value: "conversational", apiTone: "conversational", label: "Warm and human", description: "Approachable and sincere" },
  { value: "confident", apiTone: "professional", label: "Confident", description: "Direct without exaggeration" },
  { value: "short", apiTone: "professional", label: "Short and direct", description: "Concise application note" },
  { value: "entry", apiTone: "conversational", label: "Entry-level", description: "Growth-focused and honest" },
  { value: "senior", apiTone: "executive", label: "Senior-level", description: "Strategic and experienced" },
  { value: "executive", apiTone: "executive", label: "Executive", description: "Leadership-oriented" },
];

export default function CoverLetterPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [jobId, setJobId] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState(false);

  if (!user) {
    router.push("/login");
    return null;
  }

  async function handleGenerate() {
    if (!jobId.trim()) {
      setError({
        title: "Missing job id",
        description: "Paste the job UUID from the listing to generate a cover letter.",
        tone: "info",
      });
      return;
    }
    setLoading(true);
    setError(null);
    setCoverLetter(null);
    setEdited(false);
    try {
      const selectedTone = TONES.find((item) => item.value === tone) ?? TONES[0];
      const result = await skills.generateCoverLetter({ jobId: jobId.trim(), tone: selectedTone.apiTone });
      setCoverLetter(result.coverLetter);
      setSource(result.source);
    } catch (err) {
      const friendly = toFriendlyError(err);
      setError({
        ...friendly,
        description: `${friendly.description} A safe editable fallback template is shown below so you can continue drafting without inventing experience.`,
      });
      setCoverLetter(buildFallbackCoverLetter({
        toneLabel: TONES.find((item) => item.value === tone)?.label ?? "Professional",
        jobId: jobId.trim(),
        candidateName: user?.name || user?.email,
      }));
      setSource("template");
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
              Generate an editable draft from your profile, resume, and a selected job without inventing experience.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="cover-letter-error"
            className={`rounded-md border p-4 text-sm ${
              error.tone === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : error.tone === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5">{error.description}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Job Details</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Use this as an application assistant, not an auto-submit tool. Review every claim before sending and replace placeholders if fallback mode is used.
            </div>
            <div>
              <label htmlFor="cover-letter-job-id" className="block text-sm font-medium text-gray-700 mb-1">
                Job ID <span className="text-gray-400 text-xs">(from the job listing)</span>
              </label>
              <input
                id="cover-letter-job-id"
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste the job UUID here"
              />
            </div>

            <div role="radiogroup" aria-label="Cover letter tone">
              <p className="block text-sm font-medium text-gray-700 mb-2">Tone</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={tone === t.value}
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
              {loading ? "Generating..." : "Generate Cover Letter"}
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
              <label htmlFor="cover-letter-textarea" className="block text-sm font-medium text-gray-700 mb-2">
                Cover Letter{" "}
                <span className="text-gray-400 font-normal">
                  (editable — personalise before sending)
                </span>
              </label>
              <textarea
                id="cover-letter-textarea"
                value={coverLetter}
                onChange={(e) => {
                  setCoverLetter(e.target.value);
                  setEdited(true);
                }}
                rows={18}
                data-testid="cover-letter-textarea"
                className="w-full rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-2">
                {edited
                  ? "Your edits are preserved. Copy or paste into the application when ready."
                  : "Review and personalise before sending. Do not include experience, employers, certifications, or outcomes you cannot verify."}
              </p>
            </CardContent>
          </Card>
        )}

        <EarlyTesterFeedback area="Cover letter quality" />
      </div>
    </div>
  );
}
