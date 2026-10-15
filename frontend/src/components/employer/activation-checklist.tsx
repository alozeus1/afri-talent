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
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";
import { Eyebrow } from "./employer-ui";

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
  title,
  subtitle,
}: EmployerActivationChecklistProps) {
  const locale = useLocale();
  const { t, tv, ts } = useEmployerI18n();
  // Free launch: no plan to choose, so the plan step is hidden.
  const visibleChecklist = FREE_MODE
    ? checklist.filter((item) => item.key !== "subscription_choice")
    : checklist;
  const focusStep: EmployerOnboardingStep =
    FREE_MODE && currentStep === "subscription_choice" ? "trust_completion" : currentStep;
  const pct = Math.max(0, Math.min(100, completionPct));

  return (
    <Card className="border-line bg-surface shadow-card">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Eyebrow className="text-primary-text">{t("checklist.eyebrow")}</Eyebrow>
            <h2 className="mt-2 text-xl font-semibold text-fg">{title ?? t("checklist.title")}</h2>
            <p className="mt-2 max-w-3xl text-sm text-fg-secondary">{subtitle ?? t("checklist.subtitle")}</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-success-line bg-primary-soft px-4 py-3 text-sm">
            <p className="font-semibold text-primary-text">{t("checklist.complete", { pct })}</p>
            <p className="mt-1 text-fg-secondary">{t("checklist.focus", { step: tv("step", focusStep) })}</p>
          </div>
        </div>
        <div
          className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("checklist.progressLabel")}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-2">
          {visibleChecklist.map((item, index) => (
            <li
              key={item.key}
              className={`rounded-2xl border px-4 py-4 transition-colors ${
                item.done ? "border-success-line bg-success-soft" : "border-line bg-surface-sunken"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    item.done ? "bg-primary text-primary-fg" : "bg-surface text-fg-muted ring-1 ring-line-strong"
                  }`}
                >
                  {item.done ? "✓" : index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-fg">{ts(item.label)}</p>
                    {item.done && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-text">
                        {t("checklist.done")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fg-secondary">{ts(item.description)}</p>
                  <Link
                    href={localizePath(item.href, locale)}
                    className="mt-3 inline-flex rounded text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {item.done ? t("checklist.reviewStep") : t("checklist.openStep")}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-2xl border border-line bg-surface-sunken px-5 py-5">
          <Eyebrow className="text-primary-text">{t("checklist.nextBest")}</Eyebrow>
          <h3 className="mt-2 text-lg font-semibold text-fg">{ts(nextAction.title)}</h3>
          <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{ts(nextAction.body)}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={localizePath(nextAction.href, locale)}>
              <Button size="sm">{ts(nextAction.ctaLabel)}</Button>
            </Link>
            <Link href={localizePath("/employer/analytics", locale)}>
              <Button size="sm" variant="outline">
                {t("common.viewRoi")}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
