"use client";

import Link from "next/link";
import { HIRING_RESOURCE_GUIDES } from "@/lib/market-reference-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { useLocalizedContent } from "@/lib/i18n/content";

export default function HiringResourcesPage() {
  const tp = usePublicT();
  const locale = useLocale();
  const content = useLocalizedContent();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 max-w-3xl">
        <Badge variant="info">{tp("guides.hiring.eyebrow")}</Badge>
        <h1 className="font-display mt-3 text-4xl font-bold tracking-tight text-fg">{tp("guides.hiring.title")}</h1>
        <p className="mt-3 text-lg leading-8 text-fg-secondary">{tp("guides.hiring.subtitle")}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {content.hiringGuides(HIRING_RESOURCE_GUIDES).map((guide) => (
          <Card key={guide.title} className="h-full">
            <CardHeader>
              <h2 className="text-xl font-semibold text-fg">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-fg-secondary">{guide.summary}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {guide.points.map((point) => (
                  <li key={point} className="rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm leading-6 text-fg-secondary">
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-10 border-success-line bg-success-soft">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.hiring.ctaTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-secondary">{tp("guides.hiring.ctaBody")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={localizePath("/employer/talent", locale)}>
              <Button>{tp("site.footer.browseTalent")}</Button>
            </Link>
            <Link href={localizePath("/register?role=employer", locale)}>
              <Button variant="outline">{tp("guides.hiring.ctaRegister")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
