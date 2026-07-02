"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import type { Resource } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import FeedbackToast from "@/components/ui/feedback-toast";

export default function ResourceArticle({ resource }: { resource: Resource }) {
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    // Show feedback toast after a delay
    const timer = setTimeout(() => setShowFeedback(true), 5000);
    return () => clearTimeout(timer);
  }, []);

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

          <div className="prose prose-emerald max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-li:text-gray-700">
            <ReactMarkdown>{resource.content}</ReactMarkdown>
          </div>
        </div>
      </article>

      <FeedbackToast
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
        onFeedback={(type, reason) => {
          console.log("Feedback received:", type, reason);
          // Here you would normally send to your API
        }}
      />
    </div>
  );
}
