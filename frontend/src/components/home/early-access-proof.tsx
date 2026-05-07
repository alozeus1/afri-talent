import Link from "next/link";
import { Button } from "@/components/ui/button";

const futureTestimonialFields = [
  "Name",
  "Role",
  "Country",
  "Permission granted",
  "Verified workflow date",
];

const readinessSignals = [
  "Trust-first job labels and scam education",
  "Starter learning paths for cloud, security, DevOps, AI, and job search",
  "Interview practice content with sample scenarios clearly labeled",
  "Candidate workflow for resumes, cover letters, saved jobs, and applications",
];

export function EarlyAccessProof() {
  return (
    <section className="section-shell py-16 bg-zinc-50 dark:bg-zinc-900/50">
      <div className="page-frame">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="surface-panel rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Early-access proof
            </p>
            <h2 className="font-display mt-4 text-3xl font-bold text-zinc-900 dark:text-zinc-50 md:text-4xl">
              Testimonials will appear after real candidate and employer workflows.
            </h2>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              AfriTalent is currently onboarding early testers. We are not showing fabricated quotes,
              fake placement outcomes, or invented employer partnerships. Verified testimonials will be
              published only after users complete real platform workflows and grant permission.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/register">
                <Button className="w-full sm:w-auto">Join early access</Button>
              </Link>
              <Link href="/resources">
                <Button variant="outline" className="w-full sm:w-auto">
                  Share feedback
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-panel interactive-card rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-50">
                What is real now
              </h3>
              <ul className="mt-4 space-y-3">
                {readinessSignals.map((signal) => (
                  <li key={signal} className="flex gap-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    <span className="mt-2 h-2 w-2 flex-none rounded-full bg-emerald-500" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-panel interactive-card rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-display text-xl font-bold text-zinc-900 dark:text-zinc-50">
                Future testimonial schema
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                The carousel is ready for verified quotes, but remains intentionally empty until
                AfriTalent has permissioned, real-world feedback.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {futureTestimonialFields.map((field) => (
                  <span
                    key={field}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    {field}
                  </span>
                ))}
              </div>
              <Link
                href="/employer"
                className="mt-5 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                Become a pilot employer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
