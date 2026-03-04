"use client";

import { useEffect, useState, useCallback } from "react";
import { salaryReports, SalaryReportResponse, SalaryComparison, TopPayingJob } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const COUNTRIES = [
  "USA", "UK", "Germany", "Canada", "Australia",
  "Netherlands", "Nigeria", "Kenya", "South Africa", "Remote",
];

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR"];
const SALARY_PERIODS = ["yearly", "monthly"];
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"];

export default function SalariesPage() {
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
        setTopPaying(data);
      } catch (err) {
        setTopPayingError(err instanceof Error ? err.message : "Failed to load top paying roles");
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

  // Find max salary for bar chart scaling
  const maxCompareSalary = compareData
    ? Math.max(...compareData.map((c) => c.avgSalary), 1)
    : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Know Your Worth</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Explore anonymous salary data from African professionals working globally.
          Compare compensation across countries and roles to negotiate better.
        </p>
      </div>

      {/* Search Section */}
      <Card className="mb-10">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Search Salaries</h2>
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
              <option value="">All Countries</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button onClick={handleSearch} disabled={!searchTitle.trim() || searchLoading}>
              {searchLoading ? "Searching..." : "Search"}
            </Button>
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
              No salary reports found for this search. Be the first to contribute!
            </div>
          )}
        </div>
      )}

      {/* Compare Across Countries */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Compare Across Countries</h2>
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
              {compareLoading ? "Comparing..." : "Compare"}
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
            <div className="space-y-3">
              {compareData
                .sort((a, b) => b.avgSalary - a.avgSalary)
                .map((item) => (
                  <div key={item.country} className="flex items-center gap-4">
                    <span className="w-28 text-sm font-medium text-gray-700 shrink-0">
                      {item.country}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(item.avgSalary / maxCompareSalary) * 100}%`,
                          minWidth: item.avgSalary > 0 ? "2rem" : "0",
                        }}
                      />
                    </div>
                    <span className="w-28 text-sm font-bold text-gray-900 text-right shrink-0">
                      {formatCurrency(item.avgSalary)}
                    </span>
                    <span className="w-16 text-xs text-gray-400 text-right shrink-0">
                      ({item.count})
                    </span>
                  </div>
                ))}
            </div>
          )}

          {compareData && compareData.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No comparison data available for this job title.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Paying Roles */}
      <Card className="mb-10">
        <CardHeader>
          <h2 className="text-xl font-bold text-gray-900">Top Paying Roles</h2>
          <p className="text-sm text-gray-500">Highest-paying job titles based on community reports</p>
        </CardHeader>
        <CardContent>
          {topPayingLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          )}

          {topPayingError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg">{topPayingError}</div>
          )}

          {!topPayingLoading && topPaying.length > 0 && (
            <div className="space-y-3">
              {topPaying.slice(0, 10).map((job, index) => (
                <div
                  key={job.jobTitle}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
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
                    <span className="text-xs text-gray-400">({job.count} reports)</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!topPayingLoading && topPaying.length === 0 && !topPayingError && (
            <div className="text-center py-8 text-gray-500">
              No data available yet. Be the first to submit your salary!
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
          {showSubmitForm ? "Cancel" : "💰 Submit Your Salary"}
        </Button>
      </div>

      {/* Submit Form */}
      {showSubmitForm && (
        <Card className="mb-10">
          <CardHeader>
            <h2 className="text-xl font-bold text-gray-900">Submit Your Salary</h2>
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
                  {submitLoading ? "Submitting..." : "Submit Salary"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
