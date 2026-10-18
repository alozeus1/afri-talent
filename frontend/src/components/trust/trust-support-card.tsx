"use client";

import Link from "next/link";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TrustSupportCardProps {
  title?: string;
  description?: string;
  reportHref: string;
  supportEmail?: string;
}

export function TrustSupportCard({
  title,
  description,
  reportHref,
  supportEmail = "support@afritalent.com",
}: TrustSupportCardProps) {
  const tp = usePublicT();
  const locale = useLocale();
  return (
    <Card className="border-line bg-surface-sunken">
      <CardHeader>
        <h2 className="text-xl font-semibold text-fg">{title ?? tp("site.trust.supportTitle")}</h2>
        <p className="text-sm leading-6 text-fg-secondary">{description ?? tp("site.trust.supportBody")}</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Link href={reportHref}>
          <Button size="sm">{tp("site.trust.reportActivity")}</Button>
        </Link>
        <Link
          href={localizePath("/contact?topic=TRUST_SAFETY", locale)}
          prefetch={false}
          className="inline-flex items-center justify-center rounded-lg border-2 border-primary px-3 py-1.5 text-sm font-medium text-primary-text transition-colors hover:bg-success-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {tp("site.notFound.contact")}
        </Link>
        <a
          href={`mailto:${supportEmail}?subject=AfriTalent%20Trust%20Support`}
          className="inline-flex items-center px-1 text-sm font-medium text-fg-secondary underline-offset-2 hover:underline"
        >
          {supportEmail}
        </a>
      </CardContent>
    </Card>
  );
}
