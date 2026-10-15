"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Info } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { searchJobs } from "@/lib/api/orchestratorClient";
import type { SearchJobResult } from "@/lib/api/orchestratorTypes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { buildFallbackCoverLetter } from "@/lib/early-tester-content";
import { FREE_MODE } from "@/lib/free-mode";
import {
  CandidateBackLink,
  CandidateErrorAlert,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  candidateLabelClass,
  toCandidateFriendly,
  type CandidateFriendlyError,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

type Tone = "professional" | "conversational" | "executive" | "confident" | "short" | "entry" | "senior";

const TONES: { value: Tone; apiTone: "professional" | "conversational" | "executive" }[] = [
  { value: "professional", apiTone: "professional" },
  { value: "conversational", apiTone: "conversational" },
  { value: "confident", apiTone: "professional" },
  { value: "short", apiTone: "professional" },
  { value: "entry", apiTone: "conversational" },
  { value: "senior", apiTone: "executive" },
  { value: "executive", apiTone: "executive" },
];

function CoverLetterPageContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useCandidateT();

  const [jobId, setJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState<SearchJobResult | null>(null);
  const [jobQuery, setJobQuery] = useState("");
  const [jobResults, setJobResults] = useState<SearchJobResult[]>([]);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tone, setTone] = useState<Tone>("professional");
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CandidateFriendlyError | null>(null);
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, user, router, locale]);

  useEffect(() => {
    const fromJobId = searchParams.get("jobId");
    if (fromJobId) {
      setJobId(fromJobId);
      setSelectedJob({
        id: fromJobId,
        title: searchParams.get("title") || "",
        company: searchParams.get("company") || "",
        location: searchParams.get("location") || "",
        type: "",
        seniority: "",
        rawText: "",
        url: null,
      });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!jobQuery.trim()) {
      setJobResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setJobSearchLoading(true);
      searchJobs(jobQuery, 8)
        .then(setJobResults)
        .catch(() => setJobResults([]))
        .finally(() => setJobSearchLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [jobQuery]);

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  async function handleGenerate() {
    const effectiveJobId = selectedJob?.id || jobId.trim();
    if (!effectiveJobId) {
      setError({ title: t("cl.chooseJob.title"), description: t("cl.chooseJob.body"), tone: "info" });
      return;
    }
    setLoading(true);
    setError(null);
    setCoverLetter(null);
    setEdited(false);
    const selectedTone = TONES.find((item) => item.value === tone) ?? TONES[0];
    try {
      const result = await skills.generateCoverLetter({ jobId: effectiveJobId, tone: selectedTone.apiTone });
      setCoverLetter(result.coverLetter);
      setSource(result.source);
    } catch (err) {
      const friendly = toCandidateFriendly(err, t);
      setError({ ...friendly, description: `${friendly.description} ${t("cl.fallbackNote")}` });
      setCoverLetter(
        buildFallbackCoverLetter({
          toneLabel: t(`cl.tone.${tone}` as CandidateMessageKey),
          jobId: effectiveJobId,
          candidateName: user?.name || user?.email,
        }),
      );
      setSource("template");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!coverLetter) return;
    try {
      await navigator.clipboard.writeText(coverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("cl.title")}
        description={t("cl.subtitle")}
        actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
      />

      <div className="space-y-6">
        {error && <CandidateErrorAlert error={error} testId="cover-letter-error" />}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("cl.jobDetails")}</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-3 rounded-xl border border-info-line bg-info-soft p-4 text-sm text-fg-secondary">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              <p>{t("cl.assistantNote")}</p>
            </div>
            <div>
              <label htmlFor="cover-letter-job-search" className={candidateLabelClass}>
                {t("cl.selectJob")}
              </label>
              <input
                id="cover-letter-job-search"
                type="search"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
                className={candidateFieldClass}
                placeholder={t("cl.searchPlaceholder")}
                autoComplete="off"
              />
              {jobSearchLoading && (
                <p role="status" className="mt-2 text-xs text-fg-muted">
                  {t("cl.searching")}
                </p>
              )}
              {jobResults.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {jobResults.map((job) => (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJob(job);
                          setJobId(job.id);
                          setJobQuery("");
                          setJobResults([]);
                        }}
                        className="w-full rounded-xl border border-line bg-surface p-3 text-start text-sm transition hover:border-success-line hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        <span className="block font-semibold text-fg">{job.title}</span>
                        <span className="mt-1 block text-xs text-fg-secondary">
                          {[job.company, job.location || t("cl.noLocation"), job.type ? enumLabel(t, "jobType", job.type) : t("cl.role")].join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedJob && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-fg">{selectedJob.title || t("cl.selectedJob")}</p>
                    <p className="mt-1 text-xs text-fg-secondary">
                      {[selectedJob.company || t("cl.afritalentJob"), selectedJob.location || t("cl.noLocation")].join(" · ")}
                    </p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                aria-expanded={showAdvanced}
                className="mt-3 text-sm font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline"
              >
                {showAdvanced ? t("cl.advancedHide") : t("cl.advancedShow")}
              </button>
              {showAdvanced && (
                <div className="mt-3">
                  <label htmlFor="cover-letter-job-id" className={candidateLabelClass}>
                    {t("cl.manualId")}
                  </label>
                  <input
                    id="cover-letter-job-id"
                    type="text"
                    dir="ltr"
                    value={jobId}
                    onChange={(e) => {
                      setJobId(e.target.value);
                      setSelectedJob(null);
                    }}
                    className={candidateFieldClass}
                    placeholder={t("cl.manualIdPlaceholder")}
                  />
                </div>
              )}
            </div>

            <div role="radiogroup" aria-label={t("cl.toneLabel")}>
              <p className="mb-2 block text-sm font-medium text-fg-secondary">{t("cl.tone")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TONES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={tone === item.value}
                    onClick={() => setTone(item.value)}
                    className={`rounded-xl border px-4 py-3 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      tone === item.value
                        ? "border-primary bg-primary-soft text-primary-text"
                        : "border-line bg-surface text-fg-secondary hover:border-line-strong"
                    }`}
                  >
                    <div className="font-medium">{t(`cl.tone.${item.value}` as CandidateMessageKey)}</div>
                    <div className="mt-0.5 text-xs text-fg-muted">{t(`cl.tone.${item.value}.desc` as CandidateMessageKey)}</div>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={handleGenerate} disabled={loading || !(selectedJob?.id || jobId.trim())} className="w-full">
              {loading ? t("cl.generating") : t("cl.generate")}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg">{t("cl.yours")}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={source === "ai" ? "success" : "default"}>
                    {source === "ai" ? t("ai.source.ai") : t("ai.source.template")}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={handleCopy} aria-live="polite">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {copied ? t("ui.copied") : t("ui.copy")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCoverLetter(null);
                      setSource(null);
                    }}
                  >
                    {t("cl.regenerate")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <label htmlFor="cover-letter-textarea" className={candidateLabelClass}>
                {t("cl.letterLabel")} <span className="font-normal text-fg-muted">{t("cl.letterHint")}</span>
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
                className={`${candidateFieldClass} leading-relaxed`}
              />
              <p className="mt-2 text-xs text-fg-muted">{edited ? t("cl.edited") : t("cl.review")}</p>
            </CardContent>
          </Card>
        )}

        <EarlyTesterFeedback area="Cover letter quality" />
      </div>
    </div>
  );
}

export default function CoverLetterPage() {
  return (
    <Suspense fallback={<LoadingState lines={6} className="mx-auto max-w-6xl px-4 py-8" />}>
      <CoverLetterPageContent />
    </Suspense>
  );
}
