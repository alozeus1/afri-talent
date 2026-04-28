import Image from "next/image";
import Link from "next/link";
import { EarlyAccessProof } from "@/components/home/early-access-proof";
import { HeroStats } from "@/components/home/hero-stats";
import { Button } from "@/components/ui/button";
import { Globe, Plane, ShieldCheck, Sparkles } from "lucide-react";

const productSignals = [
  {
    title: "Remote-first jobs",
    description: "Global roles filtered through an Africa-to-global lens instead of a generic listings feed.",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: Globe,
  },
  {
    title: "Visa sponsorship clarity",
    description: "Support signals and mobility context that reduce ambiguity before you commit to a role.",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    icon: Plane,
  },
  {
    title: "Relocation readiness",
    description: "A product direction that treats cross-border readiness like part of hiring quality, not an afterthought.",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    icon: ShieldCheck,
  },
  {
    title: "AI-assisted workflow",
    description: "Candidate support, matching direction, and apply-pack thinking designed for faster, sharper applications.",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    icon: Sparkles,
  },
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
  return (
    <div className="pb-12 bg-[var(--background)]">
      <section className="section-shell relative overflow-hidden px-0 pt-8 md:pt-12">
        <div className="page-frame">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white px-6 py-16 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 md:px-10 md:py-20 lg:px-14">
            <Image
              src="/images/generated/afritalent-hero-global-talent.png"
              alt="African technology professional exploring global job opportunities"
              fill
              className="object-cover opacity-[0.08] mix-blend-multiply dark:opacity-[0.14] dark:mix-blend-screen pointer-events-none"
            />
            <div className="relative grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
              <div>
                <div className="eyebrow-pill mb-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
                    Trust-first Africa-to-global hiring
                  </span>
                </div>

                <h1 className="font-display max-w-4xl text-5xl font-bold leading-[1.05] text-zinc-900 dark:text-zinc-50 md:text-6xl lg:text-7xl">
                  Give African talent a higher-signal path to{" "}
                  <span className="text-emerald-700 dark:text-emerald-400">global opportunities.</span>
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400 md:text-xl">
                  AfriTalent combines job discovery, trust verification, candidate workflow, and employer-side hiring structure so the shortlist feels smaller, cleaner, and easier to trust.
                </p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  <Link href="/jobs">
                    <Button size="lg" className="w-full sm:w-auto">
                      Explore trusted jobs
                    </Button>
                  </Link>
                  <Link href="/register?role=employer">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      Launch employer onboarding
                    </Button>
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  <Link href="/jobs?filter=remote" className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    Remote-first roles
                  </Link>
                  <Link href="/jobs?filter=visa" className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    Visa-supported opportunities
                  </Link>
                  <Link href="/trust" className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 transition-colors">
                    See trust model
                  </Link>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="surface-panel absolute -left-10 top-8 z-20 max-w-[14rem] rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg">
                  <p className="text-xs uppercase tracking-widest font-semibold text-zinc-500 dark:text-zinc-400">Launch thesis</p>
                  <p className="font-display mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                    Smaller shortlists. Stronger trust.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Trust cues and candidate readiness signals designed for distributed teams.
                  </p>
                </div>

                <div className="surface-panel relative ml-auto w-full max-w-[36rem] rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                  <div className="relative h-[540px] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <Image
                      src="/images/hero/homepage-design.png"
                      alt="AfriTalent platform preview"
                      fill
                      className="object-contain p-4"
                      priority
                      quality={72}
                      sizes="(max-width: 1023px) 0px, 50vw"
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {["Candidate trust signals", "Semantic-ready discovery", "Employer analytics"].map((item) => (
                      <div
                        key={item}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                      >
                        {item}
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
              Why AfriTalent feels different
            </p>
            <h2 className="font-display mt-4 text-3xl font-bold text-zinc-900 dark:text-zinc-50 md:text-5xl">
              A premium hiring experience built around signal, not noise.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Underneath the interface, AfriTalent is shaping trust, workflow, and verified data into a tighter hiring operating model.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {productSignals.map((item) => (
              <div key={item.title} className="surface-panel interactive-card rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg ${item.tone}`}>
                  <item.icon className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{item.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.description}</p>
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
                <Image
                  src="/images/generated/afritalent-smart-search-workspace.png"
                  alt="Smart job search workspace with hiring signals and candidate notes"
                  fill
                  className="object-cover opacity-90"
                  sizes="(max-width: 1023px) 100vw, 42vw"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-950/55 via-transparent to-amber-500/15" />
              </div>

              <div className="px-6 py-12 md:px-10 lg:px-12">
                <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  Smart aggregation
                </p>
                <h2 className="font-display mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50 md:text-3xl">
                  Jobs from global platforms, filtered through an Africa-to-global lens
                </h2>
                <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                  We aggregate from multiple sources, offering better trust, sharper matching, and stronger readiness signals.
                </p>

                <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3">
                  {sourceLabels.map(([label, sublabel]) => (
                    <div key={label}>
                      <div className="font-bold text-zinc-800 dark:text-zinc-200">{label}</div>
                      <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-500">{sublabel}</div>
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
            <Image
              src="/images/generated/afritalent-collaboration-hiring.png"
              alt="Hiring team collaborating with a remote teammate"
              fill
              className="object-cover opacity-20 mix-blend-overlay pointer-events-none"
            />
            <div className="relative text-center z-10">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
                A new standard for hiring
              </p>
              <h2 className="font-display mt-5 text-3xl font-bold text-white md:text-5xl">
                Build the profile. Surface the trust.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-emerald-100/90 leading-relaxed">
                Join a platform designed to reward credibility and promote cleaner cross-border matching.
              </p>
            </div>

            <div className="relative mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto bg-emerald-500 text-white hover:bg-emerald-600 border-transparent">
                  Create your profile
                </Button>
              </Link>
              <Link href="/resources">
                <Button size="lg" variant="outline" className="w-full border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800 hover:text-white sm:w-auto">
                  Explore resources
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
