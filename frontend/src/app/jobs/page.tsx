"use client";

import { useEffect, useState, useCallback } from "react";
import { jobs, JobListResponse } from "@/lib/api";
import { JobCard } from "@/components/jobs/job-card";
import { JobFilters } from "@/components/jobs/job-filters";
import { Button } from "@/components/ui/button";

export default function JobsPage() {
  const [data, setData] = useState<JobListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [seniority, setSeniority] = useState("");
  const [page, setPage] = useState(1);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await jobs.list({
        search: search || undefined,
        location: location || undefined,
        type: type || undefined,
        seniority: seniority || undefined,
        page,
        limit: 12,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [search, location, type, seniority, page]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchJobs();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchJobs]);

  const clearFilters = () => {
    setSearch("");
    setLocation("");
    setType("");
    setSeniority("");
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Find Your Next Role</h1>
        <p className="text-gray-600">Browse remote and international opportunities from top companies</p>
      </div>

      <JobFilters
        search={search}
        location={location}
        type={type}
        seniority={seniority}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onLocationChange={(v) => { setLocation(v); setPage(1); }}
        onTypeChange={(v) => { setType(v); setPage(1); }}
        onSeniorityChange={(v) => { setSeniority(v); setPage(1); }}
        onClear={clearFilters}
      />

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <div className="mb-4 text-gray-600">
            {data.pagination.total} job{data.pagination.total !== 1 ? "s" : ""} found
          </div>

          {data.jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">No jobs found matching your criteria</p>
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-gray-600">
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
