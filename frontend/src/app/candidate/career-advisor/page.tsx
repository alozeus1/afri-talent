"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skills, CareerAdviceResult } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FREE_MODE } from "@/lib/free-mode";
import {
  CandidateBackLink,
  CandidateErrorAlert,
  CandidatePageHeader,
  candidateFieldClass,
  candidateLabelClass,
  toCandidateFriendly,
  type CandidateFriendlyError,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

const priorityVariant: Record<string, "danger" | "warning" | "default"> = {
  high: "danger",
  medium: "warning",
  low: "default",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-fg">{title}</h2>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function CareerAdvisorPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();

  const [targetRole, setTargetRole] = useState("");
  const [advice, setAdvice] = useState<CareerAdviceResult | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; targetRole: string | null; createdAt: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<CandidateFriendlyError | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await skills.getCareerHistory(5);
      setHistory(data.sessions.map((s) => ({ id: s.id, targetRole: s.targetRole, createdAt: s.createdAt })));
      if (data.sessions.length > 0) {
        setAdvice(data.sessions[0].adviceContent);
        setTargetRole(data.sessions[0].targetRole || "");
      }
    } catch {
      // No history yet is a normal first-visit state.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(localizePath("/login", locale));
      return;
    }
    void loadHistory();
  }, [user, authLoading, loadHistory, router, locale]);

  async function handleAnalyse(event?: React.FormEvent) {
    event?.preventDefault();
    if (!targetRole.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await skills.analyseCareer({ targetRole });
      setAdvice(result.advice);
      await loadHistory();
    } catch (err) {
      setError(toCandidateFriendly(err, t));
    } finally {
      setLoading(false);
    }
  }

  if (historyLoading) return <DashboardSkeleton />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("ca.title")}
        description={t("ca.subtitle")}
        actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="p-5">
            <form onSubmit={handleAnalyse}>
              <label htmlFor="career-target-role" className={candidateLabelClass}>
                {t("ca.targetRole")}
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="career-target-role"
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder={t("ca.placeholder")}
                  className={`${candidateFieldClass} flex-1`}
                />
                <Button type="submit" disabled={loading || !targetRole.trim()} isLoading={loading}>
                  {loading ? t("ca.analysing") : advice ? t("ca.reanalyse") : t("ca.analyse")}
                </Button>
              </div>
            </form>
            {error && <CandidateErrorAlert error={error} testId="career-advisor-error" className="mt-3" />}
          </CardContent>
        </Card>

        {!advice && !loading && (
          <EmptyState
            testId="career-advisor-empty"
            icon={<Compass className="h-6 w-6" />}
            title={t("ca.empty.title")}
            description={t("ca.empty.body")}
          />
        )}

        {advice && (
          <div className="space-y-4">
            <Section title={t("ca.overview")}>
              <p className="text-sm leading-relaxed text-fg-secondary">{advice.summary}</p>
            </Section>

            <Section title={t("ca.salary")}>
              <p className="text-2xl font-semibold tabular-nums text-fg">
                {advice.salaryRange.currency} {fmt.number(advice.salaryRange.min)} – {fmt.number(advice.salaryRange.max)}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{advice.salaryRange.market}</p>
            </Section>

            <Section title={t("ca.gaps")}>
              <ul className="space-y-3">
                {advice.skillGaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Badge variant={priorityVariant[gap.priority] || "default"} className="shrink-0">
                      {enumLabel(t, "ca.priority", gap.priority)}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-fg">{gap.skill}</p>
                      <p className="text-xs text-fg-muted">{gap.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t("ca.paths")}>
              <div className="space-y-3">
                {advice.careerPaths.map((path, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-sunken p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-fg">{path.title}</p>
                      <Badge variant="info">{path.timeline}</Badge>
                    </div>
                    <p className="text-xs text-fg-muted">{path.description}</p>
                  </div>
                ))}
              </div>
            </Section>

            {advice.certifications.length > 0 && (
              <Section title={t("ca.certs")}>
                <div className="space-y-3">
                  {advice.certifications.map((cert, i) => (
                    <div key={i} className="rounded-xl border border-line bg-surface-sunken p-3">
                      <p className="text-sm font-semibold text-fg">{cert.name}</p>
                      <p className="text-xs text-fg-muted">{cert.provider}</p>
                      <p className="mt-1 text-xs text-fg-secondary">{cert.rationale}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title={t("ca.plan")}>
              <ol className="space-y-2">
                {advice.actionPlan.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Badge variant="default" className="shrink-0">
                      {step.week}
                    </Badge>
                    <p className="text-sm text-fg-secondary">{step.action}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <p className="text-xs text-fg-muted">{t("ca.aiNote")}</p>
          </div>
        )}

        {history.length > 1 && (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium text-fg-secondary">{t("ca.history")}</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {history.map((session) => (
                  <li key={session.id} className="text-xs text-fg-muted">
                    {session.targetRole || t("ca.untitled")} — {fmt.date(session.createdAt)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
