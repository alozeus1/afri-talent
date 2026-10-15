"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import type { Resource } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import FeedbackToast from "@/components/ui/feedback-toast";
import { ArrowLeft } from "lucide-react";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

export default function ResourceArticle({ resource }: { resource: Resource }) {
  const tp = usePublicT();
  const locale = useLocale();
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    // Show feedback toast after a delay
    const timer = setTimeout(() => setShowFeedback(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href={localizePath("/resources", locale)} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tp("site.error.backToResources")}
      </Link>

      <article className="bg-surface rounded-xl border border-line overflow-hidden">
        {resource.coverImage && (
          <div className="relative h-64 md:h-80 bg-surface-muted">
            <Image
              src={resource.coverImage}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
          </div>
        )}

        <div className="p-8">
          <Badge variant="info" className="mb-4">{resource.category}</Badge>

          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-fg mb-4">
            {resource.title}
          </h1>

          {resource.publishedAt && (
            <p className="text-fg-muted mb-6">
              {tp("guides.resources.publishedOn", {
                date: new Date(resource.publishedAt).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
              })}
            </p>
          )}

          <p className="text-xl text-fg-secondary mb-8 leading-relaxed">
            {resource.excerpt}
          </p>

          <div className="prose prose-emerald dark:prose-invert max-w-none prose-headings:font-bold prose-headings:text-fg prose-p:text-fg-secondary prose-p:leading-relaxed prose-a:text-primary-text prose-a:no-underline hover:prose-a:underline prose-strong:text-fg prose-li:text-fg-secondary">
            <ReactMarkdown>{resource.content}</ReactMarkdown>
          </div>
        </div>
      </article>

      <FeedbackToast
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
        onFeedback={() => {
          // Article feedback is not persisted yet; the toast only acknowledges it.
        }}
      />
    </div>
  );
}
