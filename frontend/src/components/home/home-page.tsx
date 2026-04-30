"use client";

import Link from "next/link";
import { EarlyAccessProof } from "@/components/home/early-access-proof";
import { HeroStats } from "@/components/home/hero-stats";
import { Button } from "@/components/ui/button";
import { Globe, Plane, ShieldCheck, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";

const featureIcons = [Globe, Plane, ShieldCheck, Sparkles];
const featureTones = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
];

const sourceLabels = [
  ["RemoteOK", "Remote global"],
  ["We Work Remotely", "Remote global"],
  ["Jobberman", "Africa"],
  ["Himalayas", "Remote global"],
  ["Arbeitnow", "Europe + visa"],
  ["Remotive", "Remote global"],
  ["Adzuna", "US, UK, EU, CA"],
];

export function HomePageContent() {
  const t = useT();

  const productSignals = [
    { titleKey: "home.feature.remoteTitle" as const, descKey: "home.feature.remoteDesc" as const, tone: featureTones[0], Icon: featureIcons[0] },
    { titleKey: "home.feature.visaTitle" as const, descKey: "home.feature.visaDesc" as const, tone: featureTones[1], Icon: featureIcons[1] },
    { titleKey: "home.feature.relocationTitle" as const, descKey: "home.feature.relocationDesc" as const, tone: featureTones[2], Icon: featureIcons[2] },
    { titleKey: "home.feature.aiTitle" as const, descKey: "home.feature.aiDesc" as const, tone: featureTones[3], Icon: featureIcons[3] },
  ];

  const signalLabels = [
    t("home.candidateTrustSignals"),
    t("home.semanticDiscovery"),
    t("home.employerAnalytics"),
  ];

  return (
    <div className="pb-12 bg-[var(--background)]">
      <section className="section-shell relative overflow-hidden px-0 pt-8 md:pt-12">
        <div className="page-frame">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white px-6 py-16 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 md:px-10 md:py-20 lg:px-14">
            <div className="relative grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
              <div>
                <div className="eyebrow-pill mb-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
                    {t("home.hero.tagline")}
                  </span>
                </div>

                <h1 className="font-display max-w-4xl text-5xl font-bold leading-[1.05] text-zinc-900 dark:text-zinc-50 md:text-6xl lg:text-7xl">
                  {t("home.hero.heading").replace("global opportunities.", "")}{" "}
                  <span className="text-emerald-700 dark:text-emerald-400">global opportunities.</span>
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400 md:text-xl">
                  {t("home.hero.description")}
                </p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  <Link href="/jobs" prefetch={false}>
                    <Button size="lg" className="w-full sm:w-auto">
                      {t("home.hero.exploreCta")}
                    </Button>
                  </Link>
                  <Link href="/register?role=employer" prefetch={false}>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      {t("home.hero.employerCta")}
                    </Button>
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  <Link href="/jobs?filter=remote" prefetch={false} className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    {t("home.hero.remoteFirstRoles")}
                  </Link>
                  <Link href="/jobs?filter=visa" prefetch={false} className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    {t("home.hero.visaSupported")}
                  </Link>
                  <Link href="/trust" prefetch={false} className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    {t("home.hero.seeTrustModel")}
                  </Link>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="surface-panel absolute -left-10 top-8 z-20 max-w-[14rem] rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg">
                  <p className="text-xs uppercase tracking-widest font-semibold text-zinc-500 dark:text-zinc-400">{t("home.launchThesis")}</p>
                  <p className="font-display mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    {t("home.smallerShortlists")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {t("home.launchThesisDesc")}
                  </p>
                </div>

                <div className="surface-panel relative ml-auto w-full max-w-[36rem] rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <div className="relative flex h-[540px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <img
                      src="/images/hero/homepage-design-preview.jpg"
                      alt="AfriTalent platform preview"
                      width={190}
                      height={600}
                      className="h-full w-auto object-contain p-4"
                      fetchPriority="high"
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {signalLabels.map((label) => (
                      <div
                        key={label}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HeroStats />

      <section className="section-shell py-20">
        <div className="page-frame">
          <div className="mb-16 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              {t("home.why.tagline")}
            </p>
            <h2 className="font-display mt-4 text-3xl font-bold text-zinc-900 dark:text-zinc-50 md:text-5xl">
              {t("home.why.heading")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              {t("home.why.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {productSignals.map((item) => (
              <div key={item.titleKey} className="surface-panel interactive-card rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg ${item.tone}`}>
                  <item.Icon className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{t(item.titleKey)}</h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell py-16">
        <div className="page-frame">
          <div className="surface-panel overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid items-stretch lg:grid-cols-[0.95fr_1.05fr]">
              <div className="relative min-h-[320px] overflow-hidden bg-zinc-950 lg:min-h-[420px]">
                <img
                  src="/images/generated/afritalent-smart-search-workspace.jpg"
                  alt="Smart job search workspace with hiring signals and candidate notes"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/55 via-transparent to-amber-500/15" />
              </div>

              <div className="px-6 py-12 md:px-10 lg:px-12">
                <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  {t("home.sources.tagline")}
                </p>
                <h2 className="font-display mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50 md:text-3xl">
                  {t("home.sources.heading")}
                </h2>
                <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                  {t("home.sources.description")}
                </p>

                <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3">
                  {sourceLabels.map(([label, sublabel]) => (
                    <div key={label}>
                      <div className="font-bold text-zinc-800 dark:text-zinc-200">{label}</div>
                      <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-300">{sublabel}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <EarlyAccessProof />
      <section className="px-0 py-20">
        <div className="page-frame text-center">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-900 bg-emerald-950 px-6 py-16 text-white shadow-2xl md:px-12">
            <img
              src="/images/generated/afritalent-collaboration-hiring.jpg"
              alt="Hiring team collaborating with a remote teammate"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay pointer-events-none"
            />
            <div className="relative text-center z-10">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
                {t("home.cta.tagline")}
              </p>
              <h2 className="font-display mt-5 text-3xl font-bold text-white md:text-5xl">
                {t("home.cta.heading")}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-emerald-100/90 leading-relaxed">
                {t("home.cta.description")}
              </p>
            </div>

            <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register" prefetch={false}>
                <Button size="lg" className="w-full sm:w-auto bg-emerald-700 text-white hover:bg-emerald-800 border-transparent">
                  {t("home.cta.candidateCta")}
                </Button>
              </Link>
              <Link href="/resources" prefetch={false}>
                <Button size="lg" variant="outline" className="w-full border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800 hover:text-white sm:w-auto">
                  {t("home.cta.resourcesCta")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
