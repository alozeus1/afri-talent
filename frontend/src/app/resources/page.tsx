"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { resources, ResourceListResponse } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OFFICIAL_IMMIGRATION_GUIDES } from "@/lib/market-reference-data";

export default function ResourcesPage() {
  const [data, setData] = useState<ResourceListResponse | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await resources.list({
        search: search || undefined,
        category: category || undefined,
        page,
        limit: 9,
      });
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }, [search, category, page]);

  useEffect(() => {
    resources.categories().then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchResources();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchResources]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Resources Hub</h1>
        <p className="text-gray-600">Career advice, industry insights, and guides for African tech professionals</p>
      </div>

      {/* Featured Guides */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Official Immigration Guides</h2>
        <p className="mb-4 text-sm text-gray-600">
          Candidate planning notes sourced from government immigration pages. Rules change, so always verify on the official page before applying.
        </p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {OFFICIAL_IMMIGRATION_GUIDES.map((guide) => (
            <div key={guide.country} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="info" className="mb-2">{guide.country}</Badge>
                  <h3 className="font-semibold text-gray-900">{guide.pathway}</h3>
                </div>
                <Badge variant="success">Official</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">{guide.summary}</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
                {guide.requirements.slice(0, 3).map((requirement) => (
                  <li key={requirement} className="rounded-lg bg-gray-50 px-3 py-2">{requirement}</li>
                ))}
              </ul>
              <a
                href={guide.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
              >
                Verify at {guide.sourceLabel}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            placeholder="Search resources..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">{error}</div>
      )}

      {!loading && data && (
        <>
          {data.resources.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No resources found</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.resources.map((resource) => (
                <Link key={resource.id} href={`/resources/${resource.slug}`}>
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    {resource.coverImage && (
                      <div className="relative h-48 bg-gray-200 rounded-t-xl overflow-hidden">
                        <Image
                          src={resource.coverImage}
                          alt={resource.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                      </div>
                    )}
                    <CardContent className={resource.coverImage ? "p-6" : "p-6"}>
                      <Badge variant="info" className="mb-3">{resource.category}</Badge>
                      <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                        {resource.title}
                      </h3>
                      <p className="text-gray-600 text-sm line-clamp-3">{resource.excerpt}</p>
                      {resource.publishedAt && (
                        <p className="text-gray-400 text-xs mt-4">
                          {new Date(resource.publishedAt).toLocaleDateString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
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
