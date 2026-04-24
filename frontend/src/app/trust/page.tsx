"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrustExplainerModal } from "@/components/trust/trust-explainer-modal";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { localizePath, useLocale } from "@/lib/i18n/client";

const employerBadgeItems = [
  {
    title: "Verified company domain",
    description: "The employer uses a company email that matches the public company website or hiring domain.",
    statusLabel: "Backed by domain checks",
    statusVariant: "success" as const,
  },
  {
    title: "Business registration reviewed",
    description: "AfriTalent reviewed submitted business registration evidence before upgrading the badge.",
    statusLabel: "Manual evidence review",
    statusVariant: "info" as const,
  },
  {
    title: "Manual review approved",
    description: "A human reviewer cleared additional trust checks such as website consistency, moderation history, and account behavior.",
    statusLabel: "Manual review",
    statusVariant: "info" as const,
  },
  {
    title: "Premium trusted employer",
    description: "This is the highest employer trust tier. It requires real verification and good standing. Paying alone does not grant it.",
    statusLabel: "Highest trust tier",
    statusVariant: "success" as const,
  },
];

const candidateBadgeItems = [
  {
    title: "Email verified",
    description: "The candidate confirmed access to their email address.",
    statusLabel: "Foundational signal",
    statusVariant: "info" as const,
  },
  {
    title: "Phone verified",
    description: "The candidate completed phone OTP verification.",
    statusLabel: "Stronger signal",
    statusVariant: "success" as const,
  },
  {
    title: "Identity reviewed",
    description: "Government ID or identity evidence was submitted and reviewed.",
    statusLabel: "Evidence-backed",
    statusVariant: "success" as const,
  },
  {
    title: "Verified skills",
    description: "A skill badge is only shown after certificate, assessment, portfolio, partner, or manual review evidence clears trust checks.",
    statusLabel: "Not self-claimed",
    statusVariant: "success" as const,
  },
  {
    title: "Employment history checked",
    description: "Employment evidence or consistency checks strengthened the candidate profile.",
    statusLabel: "Contextual review",
    statusVariant: "info" as const,
  },
];

const moderationItems = [
  {
    title: "High-risk activity is reviewed before it spreads",
    description: "Suspicious jobs, employers, messages, and candidate behavior can be limited, held, or manually reviewed before wider exposure.",
    statusLabel: "Protection in action",
    statusVariant: "warning" as const,
  },
  {
    title: "Reports matter, but one report does not decide everything",
    description: "Reports are combined with account history, verification evidence, content analysis, and other signals before badges or access change.",
    statusLabel: "Multi-signal review",
    statusVariant: "info" as const,
  },
  {
    title: "We explain caution states when helpful",
    description: "You may see labels such as New employer, Under review, or Aging listing when context helps you make a safer decision.",
    statusLabel: "Transparency",
    statusVariant: "info" as const,
  },
];

const safetyTips = [
  "Never pay application, processing, equipment, visa, or training fees to get a job on AfriTalent.",
  "Treat urgent requests to move immediately to WhatsApp, Telegram, or private email as a warning sign.",
  "Trusted badges and verified skill markers are backed by checks. Free and paid plans do not create those badges by themselves.",
  "If salary ranges feel unrealistically high, the company identity is unclear, or the application path looks off-platform, report it.",
];

const trustedJobReasons = [
  "Verified employer signals and moderation history are in good standing.",
  "The application path looks valid and matches the employer or trusted source.",
  "Salary, location, visa, or relocation details are clear enough to reduce ambiguity.",
  "Duplicate sources are merged so search results stay cleaner and easier to trust.",
];

export default function TrustCenterPage() {
  const locale = useLocale();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 mb-3">
          Trust Center
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          How AfriTalent makes hiring feel real, safer, and professionally run
        </h1>
        <p className="max-w-3xl text-lg leading-8 text-gray-600">
          We combine verification, moderation, fraud detection, and visible trust signals so candidates and employers can move faster without being asked to trust blindly.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={localizePath("/trust/report", locale)}>
            <Button>Report suspicious activity</Button>
          </Link>
          <Link href={localizePath("/jobs", locale)}>
            <Button variant="outline">Browse trusted jobs</Button>
          </Link>
        </div>
      </section>

      <TrustStatusBanner
        tone="info"
        title="Badges are earned, not bought"
        body="Paid plans can unlock reach or filters, but no employer or candidate badge is shown unless AfriTalent has real supporting checks behind it."
        actions={
          <Link href={localizePath("/employer/trust", locale)}>
            <Button size="sm" variant="outline">Employer verification</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-emerald-200">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Employer verification</h2>
            <p className="text-sm leading-6 text-gray-600">
              Employers move through increasingly strict trust tiers before they can post broadly and hire at scale.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {employerBadgeItems.slice(0, 3).map((badge) => (
              <div key={badge.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-medium text-gray-900">{badge.title}</p>
                <p className="mt-1 text-sm text-gray-600">{badge.description}</p>
              </div>
            ))}
            <TrustExplainerModal
              title="How employer badges work"
              description="Employer badges reflect actual verification checks, moderation history, and account standing."
              items={employerBadgeItems}
              footer="If an employer becomes risky or repeatedly flagged, posting access can be limited even after earlier approval."
            />
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Candidate authenticity</h2>
            <p className="text-sm leading-6 text-gray-600">
              Employers can see stronger proof when candidates verify identity, skills, linked profiles, and employment evidence.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidateBadgeItems.slice(0, 3).map((badge) => (
              <div key={badge.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-medium text-gray-900">{badge.title}</p>
                <p className="mt-1 text-sm text-gray-600">{badge.description}</p>
              </div>
            ))}
            <TrustExplainerModal
              title="How candidate trust markers work"
              description="Candidate trust signals are explainable, evidence-based, and designed to help employers understand what is actually verified."
              items={candidateBadgeItems}
              footer="Employers may pay for premium filters, but those filters only surface candidates whose signals really passed trust checks."
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Free vs paid vs verified</h2>
            <p className="text-sm leading-6 text-gray-600">
              Pricing and trust are connected in UX, but they are not the same thing.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-gray-600">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">Free</p>
              <p className="mt-1">Users can join, complete basics, and begin building trust signals.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">Paid</p>
              <p className="mt-1">Paid features can unlock visibility, workflow tools, or premium filters.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="font-semibold text-gray-900">Verified</p>
              <p className="mt-1">Verified badges require evidence, checks, or review outcomes. Payment never substitutes for verification.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Why a job or employer may look trusted</h2>
            <p className="text-sm leading-6 text-gray-600">
              Trust cues are most helpful when they explain the reason, not just show a badge.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {trustedJobReasons.map((reason) => (
              <div key={reason} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                {reason}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Moderation transparency</h2>
            <p className="text-sm leading-6 text-gray-600">
              We try to show review context when it helps people make safer choices without overwhelming onboarding.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {moderationItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-medium text-gray-900">{item.title}</p>
                <p className="mt-1 text-sm text-gray-600">{item.description}</p>
              </div>
            ))}
            <TrustExplainerModal
              title="How moderation decisions work"
              description="Moderation is designed to reduce scams and impersonation while avoiding overreaction to a single weak signal."
              items={moderationItems}
              triggerLabel="How reviews and holds work"
              footer="When possible, AfriTalent uses caution labels, review queues, and evidence requests before taking stronger action."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Safety tips</h2>
            <p className="text-sm leading-6 text-gray-600">
              A few simple checks can prevent the most common scam patterns on recruiting platforms.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {safetyTips.map((tip) => (
                <li
                  key={tip}
                  className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
                >
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">How reporting works</h2>
            <p className="text-sm leading-6 text-gray-600">
              Fast, specific reports give moderators enough context to act quickly.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-gray-600">
            {[
              "Choose one primary reason code so the report lands in the right queue.",
              "Include IDs, links, screenshots, timestamps, payment requests, or the exact off-platform contact request.",
              "AfriTalent combines your report with account history, verification evidence, and other risk signals before action is taken.",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <p>{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <TrustSupportCard reportHref={localizePath("/trust/report", locale)} />
    </div>
  );
}
