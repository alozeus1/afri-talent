"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResumeTemplate } from "@/lib/api";
import { Lock, Download, Eye } from "lucide-react";

interface TemplateCardProps {
  template: ResumeTemplate;
  canDownload: boolean;
  onDownload: (template: ResumeTemplate, format: string) => void;
  isDownloading?: boolean;
}

export function TemplateCard({
  template,
  canDownload,
  onDownload,
  isDownloading,
}: TemplateCardProps) {
  const htmlFile = template.files.find((f) => f.format === "HTML");
  const pdfFile = template.files.find((f) => f.format === "PDF");
  const primaryFile = htmlFile || pdfFile || template.files[0];

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Thumbnail */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        {template.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <Eye className="h-10 w-10" />
          </div>
        )}
        {template.isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="rounded-full bg-white/90 p-3 dark:bg-gray-900/90">
              <Lock className="h-6 w-6 text-gray-700 dark:text-gray-200" />
            </div>
          </div>
        )}
        {/* Tags overlay */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="bg-white/90 text-xs backdrop-blur-sm dark:bg-gray-900/90"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Content */}
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {template.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {template.description}
          </p>
        </div>

        {template.bestFor.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Best for: {template.bestFor.join(", ")}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          {template.isLocked ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                window.location.href = "/pricing";
              }}
            >
              <Lock className="mr-1 h-3.5 w-3.5" />
              Unlock with {template.minPlan}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!canDownload || isDownloading}
              onClick={() =>
                primaryFile && onDownload(template, primaryFile.format)
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              {isDownloading ? "Downloading..." : "Download"}
            </Button>
          )}
        </div>

        {!template.isLocked && !canDownload && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Monthly download limit reached
          </p>
        )}
      </CardContent>
    </Card>
  );
}
