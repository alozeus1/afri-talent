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

async function fetchResource(slug: string): Promise<Resource | null> {
  try {
    const res = await fetch(`${API_URL}/api/resources/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as Resource;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resource = await fetchResource(slug);
  if (!resource) {
    return { title: "Resource not found | AfriTalent" };
  }

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
  const resource = await fetchResource(slug);

  if (!resource) {
    notFound();
  }

  return <ResourceArticle resource={resource} />;
}
