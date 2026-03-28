"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  EmployerNextAction,
  EmployerOnboardingChecklistItem,
  EmployerOnboardingStep,
} from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";

const stepLabels: Record<EmployerOnboardingStep, string> = {
  company_setup: "Company setup",
  verification: "Verification",
  team_setup: "Team setup",
  first_job_post: "First job post",
  candidate_filters: "Candidate filters",
  subscription_choice: "Plan choice",
  trust_completion: "Trust completion",
};

interface EmployerActivationChecklistProps {
  checklist: EmployerOnboardingChecklistItem[];
  completionPct: number;
  currentStep: EmployerOnboardingStep;
  nextAction: EmployerNextAction;
  title?: string;
  subtitle?: string;
}

export function EmployerActivationChecklist({
  checklist,
  completionPct,
  currentStep,
  nextAction,
  title = "Activation checklist",
  subtitle = "Guide your team from setup to first qualified shortlist without losing trust or momentum.",
}: EmployerActivationChecklistProps) {
  const locale = useLocale();

  return (
    <Card className="border-emerald-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Employer activation
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">{subtitle}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">{completionPct}% complete</p>
            <p className="mt-1 text-emerald-800">Current focus: {stepLabels[currentStep]}</p>
          </div>
        </div>
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {checklist.map((item, index) => (
            <div
              key={item.key}
              className={`rounded-2xl border px-4 py-4 ${
                item.done ? "border-emerald-200 bg-emerald-50/70" : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    item.done ? "bg-emerald-600 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200"
                  }`}
                >
                  {item.done ? "✓" : index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{item.label}</p>
                    {item.done && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                  <Link
                    href={localizePath(item.href, locale)}
                    className="mt-3 inline-flex text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {item.done ? "Review step" : "Open step"}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-950 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
            Next best action
          </p>
          <h3 className="mt-2 text-lg font-semibold">{nextAction.title}</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">{nextAction.body}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={localizePath(nextAction.href, locale)}>
              <Button size="sm">{nextAction.ctaLabel}</Button>
            </Link>
            <Link href={localizePath("/employer/analytics", locale)}>
              <Button size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10 hover:text-white">
                View hiring ROI
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
