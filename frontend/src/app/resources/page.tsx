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
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { useLocalizedContent } from "@/lib/i18n/content";

export default function ResourcesPage() {
  const t = useT();
  const tp = usePublicT();
  const locale = useLocale();
  const content = useLocalizedContent();
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
      setError(err instanceof Error ? err.message : tp("guides.resources.loadError"));
    } finally {
      setLoading(false);
    }
  }, [search, category, page, tp]);

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
        <h1 className="font-display text-3xl font-bold tracking-tight text-fg mb-2 md:text-4xl">{tp("guides.resources.title")}</h1>
        <p className="text-fg-secondary">{tp("guides.resources.subtitle")}</p>
      </div>

      {/* Featured Guides */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-fg mb-2">{tp("guides.resources.officialTitle")}</h2>
        <p className="mb-4 text-sm text-fg-secondary">{tp("guides.resources.officialBody")}</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {content.immigrationGuides(OFFICIAL_IMMIGRATION_GUIDES).map((guide) => (
            <div key={`${guide.country}-${guide.pathway}`} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="info" className="mb-2">{guide.country}</Badge>
                  <h3 className="font-semibold text-fg">{guide.pathway}</h3>
                </div>
                <Badge variant="success">{tp("guides.resources.official")}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-fg-secondary">{guide.summary}</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-secondary">
                {guide.requirements.slice(0, 3).map((requirement) => (
                  <li key={requirement} className="rounded-lg bg-surface-sunken px-3 py-2">{requirement}</li>
                ))}
              </ul>
              <a
                href={guide.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex text-sm font-semibold text-primary-text underline-offset-2 hover:underline"
              >
                {tp("guides.resources.verifyAt", { source: guide.sourceLabel })}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-line p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="search"
            aria-label={tp("guides.resources.search")}
            placeholder={tp("guides.resources.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            aria-label={t("common.allCategories")}
            className="w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg shadow-xs focus:outline-none focus:ring-2 focus:ring-focus"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          >
            <option value="">{t("common.allCategories")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true" aria-label={t("common.loading")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-line bg-surface-muted" />
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-8 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">{error}</div>
      )}

      {!loading && data && (
        <>
          {data.resources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-6 py-12 text-center">
              <p className="font-semibold text-fg">{tp("guides.resources.empty")}</p>
              <p className="mt-2 text-sm text-fg-secondary">{t("common.tryAdjustingFilters")}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.resources.map((resource) => (
                <Link key={resource.id} href={localizePath(`/resources/${resource.slug}`, locale)} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <Card className="h-full cursor-pointer transition-all group-hover:-translate-y-0.5 group-hover:shadow-raised">
                    {resource.coverImage && (
                      <div className="relative h-48 bg-surface-muted rounded-t-xl overflow-hidden">
                        <Image
                          src={resource.coverImage}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                      </div>
                    )}
                    <CardContent className={resource.coverImage ? "p-6" : "p-6"}>
                      <Badge variant="info" className="mb-3">{resource.category}</Badge>
                      <h3 className="font-semibold text-lg text-fg mb-2 line-clamp-2">
                        {resource.title}
                      </h3>
                      <p className="text-fg-secondary text-sm line-clamp-3">{resource.excerpt}</p>
                      {resource.publishedAt && (
                        <p className="text-fg-muted text-xs mt-4">
                          {new Date(resource.publishedAt).toLocaleDateString(locale)}
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
                {t("common.previous")}
              </Button>
              <span className="flex items-center px-4 text-fg-secondary">
                {tp("discover.page.of", { page, total: data.pagination.totalPages })}
              </span>
              <Button
                variant="outline"
                disabled={page === data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
