"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrustExplainerModal, type TrustExplainerVariant } from "@/components/trust/trust-explainer-modal";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey, type PublicT } from "@/lib/i18n/public-messages";
import { FREE_MODE } from "@/lib/free-mode";

type ExplainerItem = { id: string; title: PublicMessageKey; description: PublicMessageKey; statusLabel: PublicMessageKey; statusVariant: TrustExplainerVariant };

const employerBadgeItems: ExplainerItem[] = [
  { id: "domain", title: "guides.trust.employer.domain", description: "guides.trust.employer.domainBody", statusLabel: "guides.trust.employer.domainStatus", statusVariant: "success" },
  { id: "registration", title: "guides.trust.employer.registration", description: "guides.trust.employer.registrationBody", statusLabel: "guides.trust.employer.registrationStatus", statusVariant: "info" },
  { id: "manual", title: "guides.trust.employer.manual", description: "guides.trust.employer.manualBody", statusLabel: "guides.trust.employer.manualStatus", statusVariant: "info" },
  {
    id: "premium",
    title: "guides.trust.employer.premium",
    description: FREE_MODE ? "guides.trust.employer.premiumBodyFree" : "guides.trust.employer.premiumBody",
    statusLabel: "guides.trust.employer.premiumStatus",
    statusVariant: "success",
  },
];

const candidateBadgeItems: ExplainerItem[] = [
  { id: "email", title: "guides.trust.candidate.email", description: "guides.trust.candidate.emailBody", statusLabel: "guides.trust.candidate.emailStatus", statusVariant: "info" },
  { id: "phone", title: "guides.trust.candidate.phone", description: "guides.trust.candidate.phoneBody", statusLabel: "guides.trust.candidate.phoneStatus", statusVariant: "success" },
  { id: "identity", title: "guides.trust.candidate.identity", description: "guides.trust.candidate.identityBody", statusLabel: "guides.trust.candidate.identityStatus", statusVariant: "success" },
  { id: "skills", title: "guides.trust.candidate.skills", description: "guides.trust.candidate.skillsBody", statusLabel: "guides.trust.candidate.skillsStatus", statusVariant: "success" },
  { id: "employment", title: "guides.trust.candidate.employment", description: "guides.trust.candidate.employmentBody", statusLabel: "guides.trust.candidate.employmentStatus", statusVariant: "info" },
];

const moderationItems: ExplainerItem[] = [
  { id: "highRisk", title: "guides.trust.moderation.highRisk", description: "guides.trust.moderation.highRiskBody", statusLabel: "guides.trust.moderation.highRiskStatus", statusVariant: "warning" },
  { id: "reports", title: "guides.trust.moderation.reports", description: "guides.trust.moderation.reportsBody", statusLabel: "guides.trust.moderation.reportsStatus", statusVariant: "info" },
  { id: "explain", title: "guides.trust.moderation.explain", description: "guides.trust.moderation.explainBody", statusLabel: "guides.trust.moderation.explainStatus", statusVariant: "info" },
];

const safetyTips: PublicMessageKey[] = [
  "guides.trust.tip.fees",
  "guides.trust.tip.offPlatform",
  FREE_MODE ? "guides.trust.tip.badgesFree" : "guides.trust.tip.badges",
  "guides.trust.tip.report",
];

const trustedJobReasons: PublicMessageKey[] = [
  "guides.trust.reason.employer",
  "guides.trust.reason.path",
  "guides.trust.reason.details",
  "guides.trust.reason.duplicates",
];

const reportingSteps: PublicMessageKey[] = ["guides.trust.reporting.step1", "guides.trust.reporting.step2", "guides.trust.reporting.step3"];

const translateItems = (items: ExplainerItem[], tp: PublicT) =>
  items.map((item) => ({
    title: tp(item.title),
    description: tp(item.description),
    statusLabel: tp(item.statusLabel),
    statusVariant: item.statusVariant,
  }));

export default function TrustCenterPage() {
  const locale = useLocale();
  const tp = usePublicT();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-xs md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" aria-hidden="true" />
        <div className="relative">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary-text">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {tp("guides.trust.eyebrow")}
          </p>
          <h1 className="font-display mb-4 max-w-4xl text-4xl font-bold tracking-tight text-fg md:text-5xl">{tp("guides.trust.title")}</h1>
          <p className="max-w-3xl text-lg leading-8 text-fg-secondary">{tp("guides.trust.subtitle")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={localizePath("/trust/report", locale)}>
              <Button>{tp("site.trust.reportActivity")}</Button>
            </Link>
            <Link href={localizePath("/jobs", locale)}>
              <Button variant="outline">{tp("guides.trust.browseTrusted")}</Button>
            </Link>
          </div>
        </div>
      </section>

      <TrustStatusBanner
        tone="info"
        title={tp("guides.trust.earnedTitle")}
        body={FREE_MODE ? tp("guides.trust.earnedBodyFree") : tp("guides.trust.earnedBody")}
        actions={
          <Link href={localizePath("/employer/trust", locale)}>
            <Button size="sm" variant="outline">{tp("guides.trust.employerSection")}</Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-success-line">
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.employerSection")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.employerSectionBody")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {employerBadgeItems.slice(0, 3).map((badge) => (
              <div key={badge.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                <p className="font-medium text-fg">{tp(badge.title)}</p>
                <p className="mt-1 text-sm text-fg-secondary">{tp(badge.description)}</p>
              </div>
            ))}
            <TrustExplainerModal
              title={tp("guides.trust.employerModalTitle")}
              description={tp("guides.trust.employerModalBody")}
              items={translateItems(employerBadgeItems, tp)}
              footer={tp("guides.trust.employerModalFooter")}
            />
          </CardContent>
        </Card>

        <Card className="border-info-line">
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.candidateSection")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.candidateSectionBody")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidateBadgeItems.slice(0, 3).map((badge) => (
              <div key={badge.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                <p className="font-medium text-fg">{tp(badge.title)}</p>
                <p className="mt-1 text-sm text-fg-secondary">{tp(badge.description)}</p>
              </div>
            ))}
            <TrustExplainerModal
              title={tp("guides.trust.candidateModalTitle")}
              description={tp("guides.trust.candidateModalBody")}
              items={translateItems(candidateBadgeItems, tp)}
              footer={FREE_MODE ? tp("guides.trust.candidateModalFooterFree") : tp("guides.trust.candidateModalFooter")}
            />
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{FREE_MODE ? tp("guides.trust.tiersTitleFree") : tp("guides.trust.tiersTitle")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{FREE_MODE ? tp("guides.trust.tiersBodyFree") : tp("guides.trust.tiersBody")}</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-fg-secondary">
            <div className="rounded-2xl border border-line bg-surface-sunken p-4">
              <p className="font-semibold text-fg">{tp("guides.trust.tierFree")}</p>
              <p className="mt-1">{tp("guides.trust.tierFreeBody")}</p>
            </div>
            {!FREE_MODE && (
              <div className="rounded-2xl border border-line bg-surface-sunken p-4">
                <p className="font-semibold text-fg">{tp("guides.trust.tierPaid")}</p>
                <p className="mt-1">{tp("guides.trust.tierPaidBody")}</p>
              </div>
            )}
            <div className="rounded-2xl border border-line bg-surface-sunken p-4">
              <p className="font-semibold text-fg">{tp("guides.trust.tierVerified")}</p>
              <p className="mt-1">{FREE_MODE ? tp("guides.trust.tierVerifiedBodyFree") : tp("guides.trust.tierVerifiedBody")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.whyTrustedTitle")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.whyTrustedBody")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {trustedJobReasons.map((reason) => (
              <div key={reason} className="rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-sm text-fg-secondary">
                {tp(reason)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.moderationTitle")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.moderationBody")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {moderationItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                <p className="font-medium text-fg">{tp(item.title)}</p>
                <p className="mt-1 text-sm text-fg-secondary">{tp(item.description)}</p>
              </div>
            ))}
            <TrustExplainerModal
              title={tp("guides.trust.moderationModalTitle")}
              description={tp("guides.trust.moderationModalBody")}
              items={translateItems(moderationItems, tp)}
              triggerLabel={tp("guides.trust.moderationModalTrigger")}
              footer={tp("guides.trust.moderationModalFooter")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.tipsTitle")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.tipsBody")}</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {safetyTips.map((tip) => (
                <li key={tip} className="rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-sm leading-6 text-fg">
                  {tp(tip)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.trust.reportingTitle")}</h2>
            <p className="text-sm leading-6 text-fg-secondary">{tp("guides.trust.reportingBody")}</p>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm leading-6 text-fg-secondary">
              {reportingSteps.map((item, index) => (
                <li key={item} className="flex gap-3 rounded-2xl border border-line bg-surface-sunken px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg"
                  >
                    {index + 1}
                  </span>
                  <p>{tp(item)}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <TrustSupportCard reportHref={localizePath("/trust/report", locale)} />
    </div>
  );
}
