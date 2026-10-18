"use client";

import Link from "next/link";
import { Briefcase, Check, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

const CANDIDATE_FEATURES: PublicMessageKey[] = [
  "discover.free.c.resume",
  "discover.free.c.matching",
  "discover.free.c.advisor",
  "discover.free.c.letters",
  "discover.free.c.interview",
  "discover.free.c.salary",
];

const EMPLOYER_FEATURES: PublicMessageKey[] = [
  "discover.free.e.posts",
  "discover.free.e.applicants",
  "discover.free.e.search",
  "discover.free.e.analytics",
  "discover.free.e.verified",
  "discover.free.e.branding",
];

function FeatureColumn({
  icon,
  title,
  features,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  features: PublicMessageKey[];
  testId: string;
}) {
  const tp = usePublicT();
  return (
    <Card className="h-full" data-testid={testId}>
      <CardContent className="p-6 md:p-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-success-soft p-2.5 text-primary-text" aria-hidden="true">
            {icon}
          </div>
          <h2 className="text-xl font-semibold text-fg">{title}</h2>
        </div>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-fg-secondary">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden="true" />
              <span>{tp(feature)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** /pricing during the free launch: no plans, no checkout, just what everyone gets. */
export function FreeForEveryone() {
  const locale = useLocale();
  const tp = usePublicT();

  return (
    <div className="bg-[var(--background)] px-4 py-12 md:py-20" data-testid="free-for-everyone">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-fg md:text-5xl">
            {tp("discover.free.title")}
          </h1>
          <p className="mt-4 text-lg font-semibold text-primary-text">{tp("discover.free.subtitle")}</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <FeatureColumn
            icon={<UserRound className="h-5 w-5" />}
            title={tp("site.footer.forCandidates")}
            features={CANDIDATE_FEATURES}
            testId="free-for-everyone-candidates"
          />
          <FeatureColumn
            icon={<Briefcase className="h-5 w-5" />}
            title={tp("site.footer.forEmployers")}
            features={EMPLOYER_FEATURES}
            testId="free-for-everyone-employers"
          />
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={localizePath("/register", locale)} prefetch={false}>
            <Button size="lg" className="w-full sm:w-auto">
              {tp("discover.free.cta")}
            </Button>
          </Link>
          <Link href={localizePath("/jobs", locale)} prefetch={false}>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              {tp("site.footer.browseJobs")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
