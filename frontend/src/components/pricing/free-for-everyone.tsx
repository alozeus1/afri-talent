"use client";

import Link from "next/link";
import { Briefcase, Check, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { localizePath, useLocale } from "@/lib/i18n/client";

const CANDIDATE_FEATURES = [
  "AI resume builder",
  "Job matching",
  "Career advisor",
  "Cover letters",
  "Interview prep",
  "Salary insights",
];

const EMPLOYER_FEATURES = [
  "Unlimited job posts",
  "Full applicant details",
  "Talent search",
  "Analytics",
  "Verified-candidate filters",
  "Employer branding",
];

function FeatureColumn({
  icon,
  title,
  features,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  features: string[];
  testId: string;
}) {
  return (
    <Card className="h-full" data-testid={testId}>
      <CardContent className="p-6 md:p-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {icon}
          </div>
          <h2 className="text-xl font-semibold text-fg dark:text-zinc-50">{title}</h2>
        </div>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-fg-secondary dark:text-zinc-300">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-text dark:text-emerald-400" />
              <span>{feature}</span>
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

  return (
    <div className="bg-[var(--background)] px-4 py-12 md:py-20" data-testid="free-for-everyone">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold leading-tight text-fg dark:text-zinc-50 md:text-5xl">
            AfriTalent is free for everyone — candidates and employers
          </h1>
          <p className="mt-4 text-lg text-emerald-700 dark:text-emerald-400 font-semibold">
            No credit card. No trial. No catch.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <FeatureColumn
            icon={<UserRound className="h-5 w-5" />}
            title="For candidates"
            features={CANDIDATE_FEATURES}
            testId="free-for-everyone-candidates"
          />
          <FeatureColumn
            icon={<Briefcase className="h-5 w-5" />}
            title="For employers"
            features={EMPLOYER_FEATURES}
            testId="free-for-everyone-employers"
          />
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={localizePath("/register", locale)} prefetch={false}>
            <Button size="lg" className="w-full sm:w-auto">
              Create your free account
            </Button>
          </Link>
          <Link href={localizePath("/jobs", locale)} prefetch={false}>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Browse jobs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
