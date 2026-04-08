import Image from "next/image";
import Link from "next/link";
import { HeroStats } from "@/components/home/hero-stats";
import { Button } from "@/components/ui/button";

const productSignals = [
  {
    title: "Remote-first jobs",
    description: "Global roles filtered through an Africa-to-global lens instead of a generic listings feed.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "Visa sponsorship clarity",
    description: "Support signals and mobility context that reduce ambiguity before you commit to a role.",
    tone: "bg-sky-100 text-sky-700",
  },
  {
    title: "Relocation readiness",
    description: "A product direction that treats cross-border readiness like part of hiring quality, not an afterthought.",
    tone: "bg-violet-100 text-violet-700",
  },
  {
    title: "AI-assisted workflow",
    description: "Candidate support, matching direction, and apply-pack thinking designed for faster, sharper applications.",
    tone: "bg-amber-100 text-amber-700",
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
    <div className="pb-12">
      <section className="section-shell relative overflow-hidden px-0 pt-8 text-white md:pt-12">
        <div className="page-frame">
          <div className="grid-radiant relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[linear-gradient(135deg,#0f1720,#0b4d54_38%,#117b6b_68%,#f4a624_120%)] px-6 py-16 shadow-[0_30px_120px_rgba(15,23,32,0.28)] md:px-10 md:py-20 lg:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_34%)]" />
            <div className="relative grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
              <div>
                <div className="eyebrow-pill mb-6">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,255,214,0.85)]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/82">
                    Trust-first Africa-to-global hiring
                  </span>
                </div>

                <h1 className="font-display max-w-4xl text-5xl font-bold leading-[0.96] md:text-6xl lg:text-7xl">
                  Give African talent a higher-signal path to{" "}
                  <span className="aurora-text">global opportunities.</span>
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-emerald-50/86 md:text-xl">
                  AfriTalent combines job discovery, trust verification, candidate AI workflow, and employer-side hiring structure so the shortlist feels smaller, cleaner, and easier to trust.
                </p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  <Link href="/jobs">
                    <Button size="lg" className="w-full sm:w-auto">
                      Explore trusted jobs
                    </Button>
                  </Link>
                  <Link href="/register?role=employer">
                    <Button size="lg" variant="outline" className="w-full border-white/25 bg-white/10 text-white hover:bg-white/16 sm:w-auto">
                      Launch employer onboarding
                    </Button>
                  </Link>
                </div>

                <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/74">
                  <Link href="/jobs?filter=remote" className="rounded-full border border-white/14 bg-white/8 px-4 py-2 transition hover:bg-white/14">
                    Remote-first roles
                  </Link>
                  <Link href="/jobs?filter=visa" className="rounded-full border border-white/14 bg-white/8 px-4 py-2 transition hover:bg-white/14">
                    Visa-supported opportunities
                  </Link>
                  <Link href="/trust" className="rounded-full border border-white/14 bg-white/8 px-4 py-2 transition hover:bg-white/14">
                    See trust model
                  </Link>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="surface-panel-strong gloss-card absolute -left-10 top-8 z-20 max-w-[14rem] rounded-[1.75rem] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Launch thesis</p>
                  <p className="font-display mt-3 text-2xl font-bold text-gray-950 dark:text-white">
                    Smaller shortlists. Stronger trust.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Trust cues, workflow depth, and candidate readiness signals designed for distributed teams.
                  </p>
                </div>

                <div className="surface-panel-strong gloss-card relative ml-auto w-full max-w-[36rem] rounded-[2rem] p-5">
                  <div className="relative h-[540px] overflow-hidden rounded-[1.5rem] border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(241,248,246,0.88))] dark:bg-[linear-gradient(180deg,rgba(12,28,43,0.95),rgba(8,19,32,0.92))]">
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
                        className="rounded-2xl border border-[var(--border-soft)] bg-white/72 px-3 py-3 text-sm font-medium text-gray-700 dark:bg-white/5 dark:text-gray-200"
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
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">
              Why AfriTalent feels different
            </p>
            <h2 className="font-display mt-4 text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-5xl">
              A premium hiring experience built around signal, not noise.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
              The visual finish is only the surface. Underneath it, AfriTalent is shaping trust, workflow, and AI assistance into a tighter hiring operating model.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {productSignals.map((item) => (
              <div key={item.title} className="surface-panel gloss-card rounded-[1.75rem] p-6 transition-transform hover:-translate-y-1">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                  <span className="font-display text-lg font-bold">{item.title.charAt(0)}</span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell py-16">
        <div className="page-frame">
          <div className="surface-panel-strong rounded-[2rem] px-6 py-10">
            <div className="mb-10 text-center">
              <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
                Jobs from global platforms, filtered through an Africa-to-global lens
              </h2>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                We already aggregate from multiple sources, but the long-term edge is better trust, better matching, and stronger readiness signals.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 opacity-70">
              {sourceLabels.map(([label, sublabel]) => (
                <div key={label} className="text-center">
                  <div className="font-semibold text-gray-700 dark:text-gray-200">{label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{sublabel}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-0 py-20">
        <div className="page-frame text-center">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-[var(--border-soft)] bg-[linear-gradient(135deg,rgba(11,20,32,0.96),rgba(13,55,63,0.94),rgba(14,127,106,0.86))] px-6 py-16 text-white shadow-[0_30px_110px_rgba(11,20,32,0.24)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.2),transparent_22%)]" />
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-white/68">
                Production-finish direction
              </p>
              <h2 className="font-display mt-5 text-3xl font-bold md:text-5xl">
                Build the profile. Surface the trust. Let the shortlist do the talking.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-white/78">
                Join a hiring platform designed to reward credibility, readiness, and cleaner cross-border matching.
              </p>
            </div>

            <div className="relative mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto">
                  Create your profile
                </Button>
              </Link>
              <Link href="/resources">
                <Button size="lg" variant="outline" className="w-full border-white/25 bg-white/10 text-white hover:bg-white/16 sm:w-auto">
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
