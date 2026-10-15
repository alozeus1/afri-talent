"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { salaryReports, SalaryReportResponse, SalaryComparison, TopPayingJob } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { TOP_PAYING_ROLE_GUIDANCE } from "@/lib/early-tester-content";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";
import { useLocalizedContent } from "@/lib/i18n/content";
import { MARKET_SALARY_BENCHMARKS } from "@/lib/market-reference-data";

const COUNTRIES = [
  "USA", "UK", "Germany", "Canada", "Australia",
  "Netherlands", "Nigeria", "Kenya", "South Africa", "Remote",
];

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR"];
const SALARY_PERIODS = ["yearly", "monthly"];
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"];
const PERIOD_KEYS: Record<string, PublicMessageKey> = { yearly: "discover.salaries.yearly", monthly: "discover.salaries.monthly" };
const SELECT_CLASS =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg shadow-xs focus:outline-none focus:ring-2 focus:ring-focus";
const CHART_TICK_CLASS = "fill-fg-secondary";

export default function SalariesPage() {
  const t = useT();
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();
  const content = useLocalizedContent();
  const { user } = useAuth();
  const [loginPrompt, setLoginPrompt] = useState(false);

  // Search state
  const [searchTitle, setSearchTitle] = useState("");
  const [searchCountry, setSearchCountry] = useState("");
  const [searchData, setSearchData] = useState<SalaryReportResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Compare state
  const [compareTitle, setCompareTitle] = useState("");
  const [compareData, setCompareData] = useState<SalaryComparison[] | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Top paying state
  const [topPaying, setTopPaying] = useState<TopPayingJob[]>([]);
  const [topPayingLoading, setTopPayingLoading] = useState(true);
  const [topPayingError, setTopPayingError] = useState<string | null>(null);

  // Submit modal state
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    jobTitle: "",
    location: "",
    country: "",
    salaryAmount: "",
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
    yearsExperience: "",
    employmentType: "FULL_TIME",
  });

  // Load top paying on mount
  useEffect(() => {
    const loadTopPaying = async () => {
      try {
        const data = await salaryReports.topPaying();
        if (data && data.length > 0) {
          setTopPaying(data);
        } else {
          setTopPaying([]);
        }
      } catch (err) {
        setTopPayingError(err instanceof Error ? err.message : tp("discover.salaries.errTop"));
        setTopPaying([]);
      } finally {
        setTopPayingLoading(false);
      }
    };
    loadTopPaying();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; tp only formats fallback copy
  }, []);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchTitle.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const data = await salaryReports.list({
        jobTitle: searchTitle.trim(),
        country: searchCountry || undefined,
      });
      setSearchData(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : tp("discover.salaries.errSearch"));
    } finally {
      setSearchLoading(false);
    }
  }, [searchTitle, searchCountry, tp]);

  // Compare handler
  const handleCompare = useCallback(async () => {
    if (!compareTitle.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const data = await salaryReports.compare(compareTitle.trim(), COUNTRIES);
      setCompareData(data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : tp("discover.salaries.errCompare"));
    } finally {
      setCompareLoading(false);
    }
  }, [compareTitle, tp]);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await salaryReports.submit({
        jobTitle: formData.jobTitle,
        location: formData.location,
        country: formData.country,
        salaryAmount: Number(formData.salaryAmount),
        salaryCurrency: formData.salaryCurrency,
        salaryPeriod: formData.salaryPeriod,
        yearsExperience: formData.yearsExperience ? Number(formData.yearsExperience) : undefined,
        employmentType: formData.employmentType,
      });
      setSubmitSuccess(true);
      setFormData({
        jobTitle: "",
        location: "",
        country: "",
        salaryAmount: "",
        salaryCurrency: "USD",
        salaryPeriod: "yearly",
        yearsExperience: "",
        employmentType: "FULL_TIME",
      });
      setTimeout(() => {
        setShowSubmitForm(false);
        setSubmitSuccess(false);
      }, 2000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tp("discover.salaries.errSubmit"));
    } finally {
      setSubmitLoading(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const benchmarks = content.salaryBenchmarks(MARKET_SALARY_BENCHMARKS);
  const selectedBenchmark = benchmarks.find((benchmark) =>
    [searchTitle, compareTitle].some((title) =>
      title.trim() && benchmark.role.toLowerCase().includes(title.trim().toLowerCase()),
    ),
  ) ?? benchmarks[0];


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-fg mb-4">{t("salaries.title")}</h1>
        <p className="text-lg text-fg-secondary max-w-2xl mx-auto">
          {t("salaries.practicalSubtitle")}
        </p>
      </div>

      {/* Search Section */}
      <Card className="mb-10">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-fg mb-4">{t("salaries.searchSalaries")}</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                aria-label={t("salaries.jobTitlePlaceholder")}
                placeholder={t("salaries.jobTitlePlaceholder")}
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <select
              aria-label={tp("discover.salaries.country")}
              className="w-full md:w-48 rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg shadow-xs focus:outline-none focus:ring-2 focus:ring-focus"
              value={searchCountry}
              onChange={(e) => setSearchCountry(e.target.value)}
            >
              <option value="">{t("salaries.allCountries")}</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{label(c)}</option>
              ))}
            </select>
            <Button onClick={handleSearch} disabled={!searchTitle.trim() || searchLoading}>
              {searchLoading ? t("common.loading") : t("salaries.searchButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Educational Role Guidance */}
      <Card className="mb-10">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-fg">{tp("discover.salaries.guidanceTitle")}</h2>
              <p className="text-sm text-fg-muted">{tp("discover.salaries.guidanceBody")}</p>
            </div>
            <Badge variant="warning">{tp("discover.salaries.sampleBadge")}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm leading-6 text-fg-secondary">
            {tp("discover.salaries.guidanceNote")}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {content.topPayingRoles(TOP_PAYING_ROLE_GUIDANCE).map((role) => (
              <article
                key={role.role}
                className="interactive-card rounded-2xl border border-line bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-fg">{role.role}</h3>
                    <p className="mt-2 text-sm leading-6 text-fg-secondary">{role.description}</p>
                  </div>
                  <Badge variant={role.remoteFriendliness === "High" ? "success" : "info"}>
                    {tp(role.remoteFriendliness === "High" ? "discover.salaries.remoteHigh" : role.remoteFriendliness === "Medium" ? "discover.salaries.remoteMedium" : "discover.salaries.remoteLow")}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.commonSkills.map((skill) => (
                    <span key={skill} className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-fg-secondary">
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-success-line bg-success-soft p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-success">
                    {tp("discover.salaries.globalRange")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-fg">{role.marketEstimate}</p>
                  <p className="mt-2 text-xs leading-5 text-fg-secondary">{role.salaryNote}</p>
                </div>
                <p className="mt-4 text-sm text-fg-secondary">{tp("discover.salaries.typicalLevel", { level: role.experienceLevel })}</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link href={localizePath(role.searchPath, locale)} className="flex-1">
                    <Button size="sm" className="w-full">{tp("discover.salaries.searchJobs")}</Button>
                  </Link>
                  <Link href={localizePath(role.learningPath, locale)} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full">{tp("discover.salaries.learningPath")}</Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchLoading && (
        <div className="mb-10" role="status" aria-busy="true" aria-label={t("common.loading")}>
          <CardGridSkeleton count={3} />
        </div>
      )}

      {searchError && (
        <div role="alert" className="mb-8 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">{searchError}</div>
      )}

      {hasSearched && !searchLoading && searchData && (
        <div className="mb-10">
          {/* Aggregate Card */}
          {searchData.stats && (
            <Card className="mb-6">
              <CardHeader>
                <h3 className="text-lg font-semibold text-fg">
                  {searchCountry
                    ? tp("discover.salaries.overviewIn", { title: searchTitle, country: label(searchCountry) })
                    : tp("discover.salaries.overview", { title: searchTitle })}
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-fg-muted">{tp("discover.salaries.average")}</p>
                    <p className="text-xl font-bold text-primary-text">
                      {formatCurrency(searchData.stats.avg)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-fg-muted">{tp("discover.salaries.minimum")}</p>
                    <p className="text-xl font-bold text-fg">
                      {formatCurrency(searchData.stats.min)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-fg-muted">{tp("discover.salaries.maximum")}</p>
                    <p className="text-xl font-bold text-fg">
                      {formatCurrency(searchData.stats.max)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-fg-muted">{tp("discover.salaries.median")}</p>
                    <p className="text-xl font-bold text-fg">
                      {formatCurrency(searchData.stats.median)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-fg-muted">{tp("discover.salaries.reports")}</p>
                    <p className="text-xl font-bold text-fg">
                      {searchData.stats.count}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Individual Reports */}
          {searchData.reports.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-fg mb-3">{tp("discover.salaries.individual")}</h3>
              {searchData.reports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-fg">{report.jobTitle}</p>
                        <p className="text-sm text-fg-muted">
                          {report.location} · {label(report.country)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary-text">
                          {new Intl.NumberFormat(locale, {
                            style: "currency",
                            currency: report.salaryCurrency || "USD",
                            maximumFractionDigits: 0,
                          }).format(report.salaryAmount)}
                        </span>
                        <Badge>{PERIOD_KEYS[report.salaryPeriod] ? tp(PERIOD_KEYS[report.salaryPeriod]) : report.salaryPeriod}</Badge>
                        {report.yearsExperience != null && (
                          <Badge variant="info">{tp("discover.salaries.yearsExp", { count: report.yearsExperience })}</Badge>
                        )}
                        {report.employmentType && (
                          <Badge variant="default">{label(report.employmentType)}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-fg-muted">
              {t("salaries.noReportsFound")}
            </div>
          )}
        </div>
      )}

      {/* Compare Across Countries */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-fg">{t("salaries.compareCountries")}</h2>
          <p className="text-sm text-fg-muted">{t("salaries.compareDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                aria-label={t("salaries.compareJobTitle")}
                placeholder={t("salaries.compareJobTitle")}
                value={compareTitle}
                onChange={(e) => setCompareTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCompare()}
              />
            </div>
            <Button onClick={handleCompare} disabled={!compareTitle.trim() || compareLoading}>
              {compareLoading ? t("common.loading") : t("salaries.compareButton")}
            </Button>
          </div>

          {compareLoading && (
            <div className="flex justify-center py-8" role="status" aria-label={t("common.loading")}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {compareError && (
            <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">{compareError}</div>
          )}

          {compareData && compareData.length > 0 && (
            <div className="h-[400px] w-full mt-8 text-fg">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={compareData.sort((a, b) => b.avgSalary - a.avgSalary)}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="country"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 14, fontWeight: 500, className: CHART_TICK_CLASS }}
                    tickFormatter={(value: string) => label(value)}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-surface-raised p-4 rounded-xl shadow-overlay border border-line">
                            <p className="font-bold text-fg mb-1">{label(data.country)}</p>
                            <p className="text-primary-text font-bold text-lg">
                              {formatCurrency(data.avgSalary)}
                            </p>
                            <p className="text-xs text-fg-muted mt-1">{tp("discover.salaries.basedOn", { count: data.count })}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="avgSalary"
                    radius={[0, 4, 4, 0]}
                    animationDuration={1500}
                    barSize={24}
                  >
                    {compareData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#10b981" className="hover:fill-emerald-500 transition-colors duration-300" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {compareData && compareData.length === 0 && (
            <div className="text-center py-8 text-fg-muted">
              {t("salaries.noCompareData")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salary Distribution by Level */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-fg">{t("salaries.distributionByLevel")}</h2>
          <p className="text-sm text-fg-muted">{tp("discover.salaries.benchmarkBody")}</p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-info-line bg-info-soft p-4 text-sm text-fg-secondary md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-semibold text-fg">{selectedBenchmark.role}</p>
              <p className="mt-1 leading-6">{selectedBenchmark.note}</p>
            </div>
            <a
              href={selectedBenchmark.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-semibold text-info underline-offset-2 hover:underline"
            >
              {selectedBenchmark.sourceLabel}
            </a>
          </div>
          <div className="h-[300px] w-full mt-4 text-fg">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={selectedBenchmark.levels}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis dataKey="level" axisLine={false} tickLine={false} tick={{ fontSize: 13, className: CHART_TICK_CLASS }} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-surface-raised p-4 rounded-xl shadow-overlay border border-line">
                          <p className="font-bold text-fg mb-1">{data.level}</p>
                          <p className="text-primary-text font-bold">{tp("discover.salaries.avg", { amount: formatCurrency(data.avg) })}</p>
                          <p className="text-xs text-fg-muted mt-1">{tp("discover.salaries.range", { min: formatCurrency(data.min), max: formatCurrency(data.max) })}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="avg" fill="#10b981" radius={[4, 4, 0, 0]} barSize={60} className="hover:fill-emerald-500 transition-colors" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Paying Roles */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-fg">{t("salaries.topPayingRoles")}</h2>
          <p className="text-sm text-fg-muted">{tp("discover.salaries.liveBody")}</p>
        </CardHeader>
        <CardContent>
          {topPayingLoading && (
            <CardGridSkeleton count={3} />
          )}

          {topPayingError && (
            <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">{topPayingError}</div>
          )}

          {!topPayingLoading && topPaying.length > 0 && (
            <div className="space-y-3">
              {topPaying.slice(0, 10).map((job, index) => (
                <div
                  key={job.jobTitle}
                  className="flex items-center justify-between py-3 border-b border-line last:border-0 animate-in fade-in slide-in-from-bottom-4 duration-700"
                  style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 flex items-center justify-center rounded-full bg-success-soft text-success text-sm font-bold">
                      {index + 1}
                    </span>
                    <span className="font-medium text-fg">{job.jobTitle}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-primary-text">
                      {formatCurrency(job.avgSalary)}
                    </span>
                    <svg aria-hidden="true" className="w-16 h-6 text-emerald-500 opacity-60 hidden sm:block" viewBox="0 0 50 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={`M 0 ${15 - (job.jobTitle.length % 5)} Q 10 ${20 - (job.jobTitle.length % 10)}, 20 ${10 - (job.jobTitle.length % 3)} T 40 ${5 + (job.jobTitle.length % 5)} L 50 2`} />
                    </svg>
                    <span className="text-xs text-fg-muted">{tp("discover.salaries.reportsCount", { count: job.count })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!topPayingLoading && topPaying.length === 0 && !topPayingError && (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken p-8 text-center text-fg-secondary">
              <h3 className="text-lg font-semibold text-fg">{t("salaries.noVerifiedReports")}</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6">{tp("discover.salaries.noVerifiedBody")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Salary Button */}
      <div className="text-center mb-10">
        <Button
          size="lg"
          onClick={() => {
            if (!user) {
              setLoginPrompt(true);
              return;
            }
            setShowSubmitForm(!showSubmitForm);
          }}
        >
          {showSubmitForm ? t("common.cancel") : t("salaries.submitSalary")}
        </Button>
        {loginPrompt && !user && (
          <p role="status" className="mt-3 text-sm text-fg-secondary">
            {tp("discover.salaries.loginPrompt")}{" "}
            <Link href={`${localizePath("/login", locale)}?redirect=${encodeURIComponent(localizePath("/salaries", locale))}`} className="font-medium text-primary-text hover:underline">
              {t("auth.signIn")}
            </Link>
          </p>
        )}
      </div>

      {/* Submit Form */}
      {showSubmitForm && (
        <Card className="mb-10">
          <CardHeader>
            <h2 className="text-xl font-bold text-fg">{t("salaries.submitSalary")}</h2>
            <p className="text-sm text-fg-muted">{tp("discover.salaries.anonymous")}</p>
          </CardHeader>
          <CardContent>
            {submitSuccess && (
              <div role="status" className="mb-4 rounded-lg border border-success-line bg-success-soft p-4 text-success">
                {tp("discover.salaries.submitted")}
              </div>
            )}

            {submitError && (
              <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">{submitError}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={tp("discover.salaries.jobTitle")}
                  id="submit-jobTitle"
                  placeholder={tp("discover.company.jobTitlePlaceholder")}
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  required
                />
                <Input
                  label={tp("discover.salaries.city")}
                  id="submit-location"
                  placeholder={tp("discover.salaries.cityPlaceholder")}
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
                <div className="w-full">
                  <label htmlFor="submit-country" className="block text-sm font-medium text-fg-secondary mb-1">
                    {tp("discover.salaries.country")}
                  </label>
                  <select
                    id="submit-country"
                    className={SELECT_CLASS}
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    required
                  >
                    <option value="">{tp("discover.salaries.selectCountry")}</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{label(c)}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label={tp("discover.salaries.amount")}
                  id="submit-salary"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder={tp("discover.salaries.amountPlaceholder")}
                  value={formData.salaryAmount}
                  onChange={(e) => setFormData({ ...formData, salaryAmount: e.target.value })}
                  required
                />
                <div className="w-full">
                  <label htmlFor="submit-currency" className="block text-sm font-medium text-fg-secondary mb-1">
                    {tp("discover.salaries.currency")}
                  </label>
                  <select
                    id="submit-currency"
                    className={SELECT_CLASS}
                    value={formData.salaryCurrency}
                    onChange={(e) => setFormData({ ...formData, salaryCurrency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full">
                  <label htmlFor="submit-period" className="block text-sm font-medium text-fg-secondary mb-1">
                    {tp("discover.salaries.period")}
                  </label>
                  <select
                    id="submit-period"
                    className={SELECT_CLASS}
                    value={formData.salaryPeriod}
                    onChange={(e) => setFormData({ ...formData, salaryPeriod: e.target.value })}
                  >
                    {SALARY_PERIODS.map((p) => (
                      <option key={p} value={p}>{tp(PERIOD_KEYS[p])}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label={tp("discover.salaries.years")}
                  id="submit-experience"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={tp("discover.salaries.yearsPlaceholder")}
                  value={formData.yearsExperience}
                  onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
                />
                <div className="w-full">
                  <label htmlFor="submit-employment" className="block text-sm font-medium text-fg-secondary mb-1">
                    {tp("discover.salaries.employment")}
                  </label>
                  <select
                    id="submit-employment"
                    className={SELECT_CLASS}
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{label(t)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={submitLoading}>
                  {submitLoading ? t("common.submitting") : t("salaries.submitButton")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
