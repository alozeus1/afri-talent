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
import { useT } from "@/lib/i18n/client";

const COUNTRIES = [
  "USA", "UK", "Germany", "Canada", "Australia",
  "Netherlands", "Nigeria", "Kenya", "South Africa", "Remote",
];

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR"];
const SALARY_PERIODS = ["yearly", "monthly"];
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"];

const MOCK_DISTRIBUTION_DATA = [
  { level: "Junior (0-2y)", min: 25000, max: 45000, avg: 35000 },
  { level: "Mid-Level (3-5y)", min: 45000, max: 80000, avg: 65000 },
  { level: "Senior (6-8y)", min: 80000, max: 130000, avg: 105000 },
  { level: "Lead/Staff (9+y)", min: 120000, max: 180000, avg: 145000 },
];

export default function SalariesPage() {
  const t = useT();
  const { user } = useAuth();

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
        setTopPayingError(err instanceof Error ? err.message : "Failed to load top paying roles");
        setTopPaying([]);
      } finally {
        setTopPayingLoading(false);
      }
    };
    loadTopPaying();
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
      setSearchError(err instanceof Error ? err.message : "Failed to search salaries");
    } finally {
      setSearchLoading(false);
    }
  }, [searchTitle, searchCountry]);

  // Compare handler
  const handleCompare = useCallback(async () => {
    if (!compareTitle.trim()) return;
    setCompareLoading(true);
    setCompareError(null);
    try {
      const data = await salaryReports.compare(compareTitle.trim(), COUNTRIES);
      setCompareData(data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Failed to compare salaries");
    } finally {
      setCompareLoading(false);
    }
  }, [compareTitle]);

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
      setSubmitError(err instanceof Error ? err.message : "Failed to submit salary");
    } finally {
      setSubmitLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  };



  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">{t("salaries.title")}</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          {t("salaries.practicalSubtitle")}
        </p>
      </div>

      {/* Search Section */}
      <Card className="mb-10">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">{t("salaries.searchSalaries")}</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Job title (e.g. Software Engineer)"
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <select
              className="w-full md:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={searchCountry}
              onChange={(e) => setSearchCountry(e.target.value)}
            >
              <option value="">{t("salaries.allCountries")}</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
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
              <h2 className="text-xl font-bold text-gray-900">Top Paying Roles: Market Guidance</h2>
              <p className="text-sm text-gray-500">
                Educational estimates for high-opportunity roles. These are not AfriTalent placement outcomes.
              </p>
            </div>
            <Badge variant="warning">Sample market estimates</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Use these cards to plan learning and search strategy. Always verify compensation against the
            country, employer, seniority, benefits, and contract type before negotiating.
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {TOP_PAYING_ROLE_GUIDANCE.map((role) => (
              <article
                key={role.role}
                className="interactive-card rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{role.role}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{role.description}</p>
                  </div>
                  <Badge variant={role.remoteFriendliness === "High" ? "success" : "info"}>
                    {role.remoteFriendliness} remote fit
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.commonSkills.map((skill) => (
                    <span key={skill} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                    Estimated global range
                  </p>
                  <p className="mt-1 text-xl font-bold text-emerald-800">{role.marketEstimate}</p>
                  <p className="mt-2 text-xs leading-5 text-emerald-900">{role.salaryNote}</p>
                </div>
                <p className="mt-4 text-sm text-gray-600">Typical level: {role.experienceLevel}</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Link href={role.searchPath} className="flex-1">
                    <Button size="sm" className="w-full">Search jobs</Button>
                  </Link>
                  <Link href={role.learningPath} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full">Learning path</Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {searchError && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">{searchError}</div>
      )}

      {hasSearched && !searchLoading && searchData && (
        <div className="mb-10">
          {/* Aggregate Card */}
          {searchData.aggregates && (
            <Card className="mb-6">
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">
                  Salary Overview for &quot;{searchTitle}&quot;
                  {searchCountry && ` in ${searchCountry}`}
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Average</p>
                    <p className="text-xl font-bold text-emerald-600">
                      {formatCurrency(searchData.aggregates.avg)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Minimum</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(searchData.aggregates.min)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Maximum</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(searchData.aggregates.max)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Median</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(searchData.aggregates.median)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Reports</p>
                    <p className="text-xl font-bold text-gray-900">
                      {searchData.aggregates.count}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Individual Reports */}
          {searchData.reports.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Individual Reports</h3>
              {searchData.reports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{report.jobTitle}</p>
                        <p className="text-sm text-gray-500">
                          {report.location} · {report.country}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-emerald-600">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: report.salaryCurrency || "USD",
                            maximumFractionDigits: 0,
                          }).format(report.salaryAmount)}
                        </span>
                        <Badge>{report.salaryPeriod}</Badge>
                        {report.yearsExperience != null && (
                          <Badge variant="info">{report.yearsExperience} yrs exp</Badge>
                        )}
                        {report.employmentType && (
                          <Badge variant="default">{report.employmentType.replace("_", " ")}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {t("salaries.noReportsFound")}
            </div>
          )}
        </div>
      )}

      {/* Compare Across Countries */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">{t("salaries.compareCountries")}</h2>
          <p className="text-sm text-gray-500">
            Select a job title to see average salaries across different countries
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Job title (e.g. Data Scientist)"
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
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          )}

          {compareError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">{compareError}</div>
          )}

          {compareData && compareData.length > 0 && (
            <div className="h-[400px] w-full mt-8">
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
                    tick={{ fill: '#374151', fontSize: 14, fontWeight: 500 }}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: '#f3f4f6' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-4 rounded-xl shadow-xl border border-gray-100">
                            <p className="font-bold text-gray-900 mb-1">{data.country}</p>
                            <p className="text-emerald-600 font-bold text-lg">
                              {formatCurrency(data.avgSalary)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Based on {data.count} reports</p>
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
            <div className="text-center py-8 text-gray-500">
              {t("salaries.noCompareData")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salary Distribution by Level */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">{t("salaries.distributionByLevel")}</h2>
          <p className="text-sm text-gray-500">
            Sample compensation bands for education only. Not verified AfriTalent salary reports.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={MOCK_DISTRIBUTION_DATA}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis dataKey="level" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 13 }} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: '#f3f4f6' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-4 rounded-xl shadow-xl border border-gray-100 dark:bg-zinc-900 dark:border-zinc-800">
                          <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">{data.level}</p>
                          <p className="text-emerald-600 font-bold">Avg: {formatCurrency(data.avg)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Range: {formatCurrency(data.min)} - {formatCurrency(data.max)}</p>
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
          <h2 className="text-xl font-bold text-gray-900">{t("salaries.topPayingRoles")}</h2>
          <p className="text-sm text-gray-500">
            Live community salary reports when available. No fallback reports are invented.
          </p>
        </CardHeader>
        <CardContent>
          {topPayingLoading && (
            <CardGridSkeleton count={3} />
          )}

          {topPayingError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">{topPayingError}</div>
          )}

          {!topPayingLoading && topPaying.length > 0 && (
            <div className="space-y-3">
              {topPaying.slice(0, 10).map((job, index) => (
                <div
                  key={job.jobTitle}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 animate-in fade-in slide-in-from-bottom-4 duration-700"
                  style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900">{job.jobTitle}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-emerald-600">
                      {formatCurrency(job.avgSalary)}
                    </span>
                    <svg className="w-16 h-6 text-emerald-500 opacity-60 hidden sm:block" viewBox="0 0 50 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={`M 0 ${15 - (job.jobTitle.length % 5)} Q 10 ${20 - (job.jobTitle.length % 10)}, 20 ${10 - (job.jobTitle.length % 3)} T 40 ${5 + (job.jobTitle.length % 5)} L 50 2`} />
                    </svg>
                    <span className="text-xs text-gray-400">({job.count} reports)</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!topPayingLoading && topPaying.length === 0 && !topPayingError && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
              <h3 className="text-lg font-semibold text-gray-900">{t("salaries.noVerifiedReports")}</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6">
                AfriTalent will show live top-paying roles after enough real salary submissions exist.
                Until then, use the market guidance cards above as planning support, not verified platform data.
              </p>
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
              alert("Please log in to submit your salary.");
              return;
            }
            setShowSubmitForm(!showSubmitForm);
          }}
        >
          {showSubmitForm ? t("common.cancel") : `💰 ${t("salaries.submitSalary")}`}
        </Button>
      </div>

      {/* Submit Form */}
      {showSubmitForm && (
        <Card className="mb-10">
          <CardHeader>
            <h2 className="text-xl font-bold text-gray-900">{t("salaries.submitSalary")}</h2>
            <p className="text-sm text-gray-500">
              All submissions are anonymous and help the community
            </p>
          </CardHeader>
          <CardContent>
            {submitSuccess && (
              <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-4">
                ✅ Salary submitted successfully! Thank you for contributing.
              </div>
            )}

            {submitError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">{submitError}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Job Title"
                  id="submit-jobTitle"
                  placeholder="e.g. Software Engineer"
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  required
                />
                <Input
                  label="Location / City"
                  id="submit-location"
                  placeholder="e.g. Lagos, London"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
                <div className="w-full">
                  <label htmlFor="submit-country" className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <select
                    id="submit-country"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    required
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Salary Amount"
                  id="submit-salary"
                  type="number"
                  placeholder="e.g. 80000"
                  value={formData.salaryAmount}
                  onChange={(e) => setFormData({ ...formData, salaryAmount: e.target.value })}
                  required
                />
                <div className="w-full">
                  <label htmlFor="submit-currency" className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    id="submit-currency"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.salaryCurrency}
                    onChange={(e) => setFormData({ ...formData, salaryCurrency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full">
                  <label htmlFor="submit-period" className="block text-sm font-medium text-gray-700 mb-1">
                    Salary Period
                  </label>
                  <select
                    id="submit-period"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.salaryPeriod}
                    onChange={(e) => setFormData({ ...formData, salaryPeriod: e.target.value })}
                  >
                    {SALARY_PERIODS.map((p) => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Years of Experience"
                  id="submit-experience"
                  type="number"
                  placeholder="e.g. 5"
                  value={formData.yearsExperience}
                  onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
                />
                <div className="w-full">
                  <label htmlFor="submit-employment" className="block text-sm font-medium text-gray-700 mb-1">
                    Employment Type
                  </label>
                  <select
                    id="submit-employment"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.employmentType}
                    onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace("_", " ")}</option>
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
