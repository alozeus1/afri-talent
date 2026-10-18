"use client";

import { ReactNode } from "react";
import { TrustRiskLevel } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrustBadge, trustVariantFromRisk } from "@/components/trust/trust-badge";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { richText } from "@/lib/i18n/rich-text";

const RISK_LABELS: Record<string, PublicMessageKey> = {
  LOW: "site.trust.risk.LOW",
  MEDIUM: "site.trust.risk.MEDIUM",
  HIGH: "site.trust.risk.HIGH",
  CRITICAL: "site.trust.risk.CRITICAL",
};

interface TrustScoreCardProps {
  title: string;
  subtitle: string;
  badge: string;
  authenticityScore: number;
  riskScore: number;
  riskLevel: TrustRiskLevel;
  actions?: ReactNode;
  children?: ReactNode;
}

export function TrustScoreCard({
  title,
  subtitle,
  badge,
  authenticityScore,
  riskScore,
  riskLevel,
  actions,
  children,
}: TrustScoreCardProps) {
  const tp = usePublicT();
  const riskTone =
    riskLevel === "CRITICAL" || riskLevel === "HIGH"
      ? "from-danger-soft to-surface border-danger-line"
      : riskLevel === "MEDIUM"
        ? "from-warning-soft to-surface border-warning-line"
        : "from-success-soft to-surface border-success-line";

  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${riskTone}`}>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-muted">
            {tp("site.trust.summary")}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-fg">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{subtitle}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <TrustBadge
            label={badge}
            riskLevel={riskLevel}
            variant={trustVariantFromRisk(riskLevel, "success")}
            className="px-3 py-1 text-sm"
          />
          {actions}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
              {tp("site.trust.authenticity")}
            </p>
            <p className="mt-3 text-3xl font-bold text-fg">{authenticityScore}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {tp("site.trust.authenticityBody")}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
              {tp("site.trust.fraudRisk")}
            </p>
            <p className="mt-3 text-3xl font-bold text-fg">{riskScore}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {richText(tp("site.trust.fraudRiskBody", { level: RISK_LABELS[riskLevel] ? tp(RISK_LABELS[riskLevel]) : riskLevel }))}
            </p>
          </div>
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
