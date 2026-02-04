"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { resources, Resource } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ResourceDetailPage() {
  const params = useParams();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResource() {
      try {
        const data = await resources.get(params.slug as string);
        setResource(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load resource");
      } finally {
        setLoading(false);
      }
    }
    fetchResource();
  }, [params.slug]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
          {error || "Resource not found"}
        </div>
        <Link href="/resources">
          <Button variant="outline">Back to Resources</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/resources" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Resources
      </Link>

      <article className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {resource.coverImage && (
          <div className="relative h-64 md:h-80 bg-gray-200">
            <Image
              src={resource.coverImage}
              alt={resource.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
          </div>
        )}

        <div className="p-8">
          <Badge variant="info" className="mb-4">{resource.category}</Badge>
          
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {resource.title}
          </h1>

          {resource.publishedAt && (
            <p className="text-gray-500 mb-6">
              Published on {new Date(resource.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
              })}
            </p>
          )}

          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            {resource.excerpt}
          </p>

          <div className="prose max-w-none">
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {resource.content}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
