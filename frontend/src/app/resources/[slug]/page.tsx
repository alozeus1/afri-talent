// Server component: fetches the resource on the server so blog posts and
// guides ship with full SEO metadata (title, description, OpenGraph, Twitter
// card) and readable HTML on first byte. Interactivity lives in the client
// child (ResourceArticle).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Resource } from "@/lib/api";
import ResourceArticle from "./resource-article";

const API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

// Published resources change rarely; revalidate every 5 minutes.
const REVALIDATE_SECONDS = 300;

type FetchResult =
  | { kind: "ok"; resource: Resource }
  | { kind: "not-found" }
  | { kind: "error" };

// Only a backend 404 maps to the public 404 page; transient failures (5xx,
// 429, network) must surface as an error state, not "Resource not found".
async function fetchResource(slug: string): Promise<FetchResult> {
  try {
    const res = await fetch(`${API_URL}/api/resources/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", resource: (await res.json()) as Resource };
  } catch {
    return { kind: "error" };
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchResource(slug);
  if (result.kind === "not-found") {
    return { title: "Resource not found | AfriTalent" };
  }
  if (result.kind === "error") {
    // Transient backend failure — neutral metadata, never "not found"
    return { title: "Resources | AfriTalent" };
  }

  const { resource } = result;
  const description = resource.excerpt.slice(0, 160);

  return {
    title: `${resource.title} | AfriTalent`,
    description,
    openGraph: {
      title: resource.title,
      description,
      type: "article",
      publishedTime: resource.publishedAt,
      images: resource.coverImage ? [{ url: resource.coverImage }] : undefined,
    },
    twitter: {
      card: resource.coverImage ? "summary_large_image" : "summary",
      title: resource.title,
      description,
      images: resource.coverImage ? [resource.coverImage] : undefined,
    },
  };
}

export default async function ResourceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const result = await fetchResource(slug);

  if (result.kind === "not-found") {
    notFound();
  }
  if (result.kind === "error") {
    // Rendered by the route-level error boundary (error.tsx) with a retry path
    throw new Error("Failed to load resource");
  }

  return <ResourceArticle resource={result.resource} />;
}
