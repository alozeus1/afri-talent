"use client";

// Success stories, published through the Resource CMS under the
// "Success Stories" category. Renders nothing until real stories exist —
// the EarlyAccessProof section below remains the honest placeholder.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const SUCCESS_STORIES_CATEGORY = "Success Stories";

interface Story {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage?: string;
  publishedAt?: string;
}

export function SuccessStories() {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ category: SUCCESS_STORIES_CATEGORY, limit: "3" });
    fetch(`${API_URL}/api/resources?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStories(data?.resources ?? []))
      .catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  return (
    <section className="section-shell py-16">
      <div className="page-frame">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Real outcomes
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold text-zinc-900 dark:text-zinc-50 md:text-4xl">
            Success stories from the community
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {stories.map((story) => (
            <Link key={story.id} href={`/resources/${story.slug}`} className="group">
              <div className="h-full overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950/50">
                {story.coverImage && (
                  <div className="relative h-44 bg-zinc-100 dark:bg-zinc-900">
                    <Image
                      src={story.coverImage}
                      alt={story.title}
                      fill
                      className="object-cover transition group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                )}
                <div className="p-5">
                  <h3 className="font-semibold text-zinc-900 group-hover:text-emerald-700 dark:text-zinc-100 dark:group-hover:text-emerald-400">
                    {story.title}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600 line-clamp-3 dark:text-zinc-400">{story.excerpt}</p>
                  <span className="mt-3 inline-block text-sm font-medium text-emerald-700 group-hover:underline dark:text-emerald-400">
                    Read the story →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
