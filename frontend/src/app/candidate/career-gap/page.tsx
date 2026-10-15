"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skills } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { FREE_MODE } from "@/lib/free-mode";
import {
  CandidateBackLink,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
  candidateLabelClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

interface GapResult {
  explanation: string;
  framing: string;
  talkingPoints: string[];
  source: "ai" | "template";
}

export default function CareerGapPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();

  const [gapStartDate, setGapStartDate] = useState("");
  const [gapEndDate, setGapEndDate] = useState("");
  const [activities, setActivities] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [result, setResult] = useState<GapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, user, router, locale]);

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  const datesInvalid = Boolean(gapStartDate && gapEndDate && gapEndDate < gapStartDate);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!gapStartDate || !gapEndDate || datesInvalid) return;
    setLoading(true);
    setFailed(false);
    setResult(null);
    try {
      const data = await skills.explainCareerGap({
        gapStartDate,
        gapEndDate,
        activities: activities.trim() || undefined,
        targetRole: targetRole.trim() || undefined,
      });
      setResult(data);
    } catch {
      setFailed(true);
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
    setFailed(false);
  }

  async function copyFraming() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.framing);
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
        title={t("gap.title")}
        description={t("gap.subtitle")}
        actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
      />

      <div className="space-y-6">
        {failed && <CandidateNotice>{t("gap.failed")}</CandidateNotice>}

        {!result && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-fg">{t("gap.details")}</h2>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gap-start" className={candidateLabelClass}>
                      {t("gap.start")} <span aria-hidden="true" className="text-danger">*</span>
                    </label>
                    <input
                      id="gap-start"
                      type="date"
                      required
                      value={gapStartDate}
                      onChange={(e) => setGapStartDate(e.target.value)}
                      className={candidateFieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="gap-end" className={candidateLabelClass}>
                      {t("gap.end")} <span aria-hidden="true" className="text-danger">*</span>
                    </label>
                    <input
                      id="gap-end"
                      type="date"
                      required
                      min={gapStartDate || undefined}
                      value={gapEndDate}
                      onChange={(e) => setGapEndDate(e.target.value)}
                      aria-invalid={datesInvalid || undefined}
                      aria-describedby={datesInvalid ? "gap-date-error" : undefined}
                      className={candidateFieldClass}
                    />
                  </div>
                </div>
                {datesInvalid && (
                  <p id="gap-date-error" className="text-sm text-danger">
                    {t("gap.dateOrder")}
                  </p>
                )}

                <div>
                  <label htmlFor="gap-activities" className={candidateLabelClass}>
                    {t("gap.activities")} <span className="text-xs font-normal text-fg-muted">{t("ai.optional")}</span>
                  </label>
                  <textarea
                    id="gap-activities"
                    value={activities}
                    onChange={(e) => setActivities(e.target.value)}
                    rows={4}
                    className={`${candidateFieldClass} resize-y`}
                    placeholder={t("gap.activitiesPlaceholder")}
                  />
                </div>

                <div>
                  <label htmlFor="gap-role" className={candidateLabelClass}>
                    {t("gap.targetRole")} <span className="text-xs font-normal text-fg-muted">{t("ai.optional")}</span>
                  </label>
                  <input
                    id="gap-role"
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className={candidateFieldClass}
                    placeholder={t("gap.targetRolePlaceholder")}
                  />
                </div>

                <Button type="submit" disabled={loading || !gapStartDate || !gapEndDate || datesInvalid} className="w-full">
                  {loading ? t("gap.generating") : t("gap.submit")}
                </Button>
              </form>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant={result.source === "ai" ? "success" : "default"}>
                {result.source === "ai" ? t("ai.source.ai") : t("ai.source.template")}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleReset}>
                {t("gap.again")}
              </Button>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("gap.framing")}</h2>
                  <Button variant="ghost" size="sm" onClick={copyFraming} aria-live="polite">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {copied ? t("ui.copied") : t("gap.copy")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm font-medium leading-relaxed text-fg">{result.framing}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-fg">{t("gap.explanation")}</h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-fg-secondary">{result.explanation}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-fg">{t("gap.points")}</h2>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {result.talkingPoints.map((point, i) => (
                    <li key={i} className="flex gap-3 text-sm text-fg-secondary">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-info-soft text-xs font-semibold text-info"
                      >
                        {i + 1}
                      </span>
                      <span className="pt-0.5 leading-relaxed">{point}</span>
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
