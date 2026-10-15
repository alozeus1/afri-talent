"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { skills, SalaryBenchmarkRow } from "@/lib/api";
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
import { useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

interface NegotiationResult {
  recommendedRange: string;
  talkingPoints: string[];
  benefitsToNegotiate: string[];
  negotiationScript: string;
  source: "ai" | "template";
}

const CURRENCIES = ["USD", "NGN", "KES", "ZAR", "GHS", "EGP", "MAD", "XOF", "GBP", "EUR"];

export default function SalaryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();

  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [yearsExperience, setYearsExperience] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [targetSalary, setTargetSalary] = useState("");
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [benchmarks, setBenchmarks] = useState<SalaryBenchmarkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, user, router, locale]);

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!role.trim() || !location.trim()) return;
    setLoading(true);
    setFailed(false);
    setResult(null);
    setBenchmarks([]);

    // Market data lookup — cheap DB read, no quota. Fails silently: the
    // benchmark section is simply omitted when there is no data.
    skills
      .searchSalaryBenchmarks({ role: role.trim() })
      .then((data) => setBenchmarks(data.benchmarks))
      .catch(() => setBenchmarks([]));

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
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.negotiationScript) return;
    try {
      await navigator.clipboard.writeText(result.negotiationScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function handleReset() {
    setRole("");
    setLocation("");
    setCurrency("USD");
    setYearsExperience("");
    setCurrentSalary("");
    setTargetSalary("");
    setResult(null);
    setBenchmarks([]);
    setFailed(false);
    setCopied(false);
  }

  const optional = <span className="text-xs font-normal text-fg-muted">{t("ai.optional")}</span>;
  const required = (
    <span aria-hidden="true" className="text-danger">
      *
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("sal.title")}
        description={t("sal.subtitle")}
        actions={<Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>}
      />

      <div className="space-y-6">
        {failed && <CandidateNotice>{t("sal.failed")}</CandidateNotice>}

        {!result && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-fg">{t("sal.details")}</h2>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sal-role" className={candidateLabelClass}>
                      {t("sal.role")} {required}
                    </label>
                    <input
                      id="sal-role"
                      type="text"
                      required
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className={candidateFieldClass}
                      placeholder={t("sal.rolePlaceholder")}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-location" className={candidateLabelClass}>
                      {t("sal.location")} {required}
                    </label>
                    <input
                      id="sal-location"
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={candidateFieldClass}
                      placeholder={t("sal.locationPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sal-currency" className={candidateLabelClass}>
                      {t("sal.currency")}
                    </label>
                    <select id="sal-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={candidateFieldClass}>
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sal-years" className={candidateLabelClass}>
                      {t("sal.years")} {optional}
                    </label>
                    <input
                      id="sal-years"
                      type="number"
                      min={0}
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                      className={candidateFieldClass}
                      placeholder="5"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sal-current" className={candidateLabelClass}>
                      {t("sal.current")} {optional}
                    </label>
                    <input
                      id="sal-current"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={currentSalary}
                      onChange={(e) => setCurrentSalary(e.target.value)}
                      className={candidateFieldClass}
                      placeholder="150000"
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-target" className={candidateLabelClass}>
                      {t("sal.target")} {optional}
                    </label>
                    <input
                      id="sal-target"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={targetSalary}
                      onChange={(e) => setTargetSalary(e.target.value)}
                      className={candidateFieldClass}
                      placeholder="180000"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={loading || !role.trim() || !location.trim()} className="w-full">
                  {loading ? t("sal.generating") : t("sal.generate")}
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
                {t("sal.startOver")}
              </Button>
            </div>

            <Card className="border-success-line bg-success-soft">
              <CardHeader>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-success">{t("sal.range")}</h2>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-fg" dir="auto">
                  {result.recommendedRange}
                </p>
                <p className="mt-1 text-sm text-fg-secondary">{t("sal.basedOn", { role, location, currency })}</p>
              </CardContent>
            </Card>

            {benchmarks.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-fg">{t("sal.market")}</h2>
                  <p className="mt-1 text-xs text-fg-muted">{t("sal.marketBody", { role })}</p>
                </CardHeader>
                <CardContent>
                  <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-line text-start text-xs uppercase tracking-wide text-fg-muted">
                          <th scope="col" className="py-2 pe-4 text-start font-medium">{t("sal.col.role")}</th>
                          <th scope="col" className="py-2 pe-4 text-start font-medium">{t("sal.col.level")}</th>
                          <th scope="col" className="py-2 pe-4 text-start font-medium">{t("sal.col.country")}</th>
                          <th scope="col" className="py-2 pe-4 text-end font-medium">{t("sal.col.min")}</th>
                          <th scope="col" className="py-2 pe-4 text-end font-medium">{t("sal.col.median")}</th>
                          <th scope="col" className="py-2 pe-4 text-end font-medium">{t("sal.col.max")}</th>
                          <th scope="col" className="py-2 text-end font-medium">{t("sal.col.sample")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {benchmarks.map((row, i) => (
                          <tr key={i} className="border-b border-line text-fg-secondary">
                            <td className="py-2 pe-4">{row.role}</td>
                            <td className="py-2 pe-4 capitalize">{row.level}</td>
                            <td className="py-2 pe-4">{row.country}</td>
                            <td className="py-2 pe-4 text-end tabular-nums">{fmt.currency(row.salaryMin, row.currency)}</td>
                            <td className="py-2 pe-4 text-end font-semibold tabular-nums text-fg">
                              {fmt.currency(row.salaryMedian, row.currency)}
                            </td>
                            <td className="py-2 pe-4 text-end tabular-nums">{fmt.currency(row.salaryMax, row.currency)}</td>
                            <td className="py-2 text-end tabular-nums text-fg-muted">{fmt.number(row.sampleSize)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-fg">{t("sal.points")}</h2>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-fg-secondary marker:text-info" dir="auto">
                  {result.talkingPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-fg">{t("sal.benefits")}</h2>
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

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-fg">{t("sal.script")}</h2>
                  <Button variant="outline" size="sm" onClick={handleCopy} aria-live="polite">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {copied ? t("ui.copied") : t("ui.copy")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  readOnly
                  aria-label={t("sal.script")}
                  value={result.negotiationScript}
                  rows={12}
                  dir="auto"
                  className={`${candidateFieldClass} resize-y bg-surface-sunken leading-relaxed`}
                />
                <p className="mt-2 text-xs text-fg-muted">{t("sal.scriptHint")}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
