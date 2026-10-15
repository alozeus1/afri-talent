import { ReactNode } from "react";
import { TrustRiskLevel } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrustBadge, trustVariantFromRisk } from "@/components/trust/trust-badge";

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
  const riskTone =
    riskLevel === "CRITICAL" || riskLevel === "HIGH"
      ? "from-red-50 to-white border-red-200"
      : riskLevel === "MEDIUM"
        ? "from-amber-50 to-white border-amber-200"
        : "from-emerald-50 to-white border-emerald-200";

  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${riskTone}`}>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-fg-muted">
            Trust Summary
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
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
              Authenticity Score
            </p>
            <p className="mt-3 text-3xl font-bold text-fg">{authenticityScore}</p>
            <p className="mt-1 text-sm text-fg-muted">
              Higher means more trusted checks, evidence, and consistent signals are on record.
            </p>
          </div>
          <div className="rounded-2xl border border-white/80 bg-white/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
              Fraud Risk
            </p>
            <p className="mt-3 text-3xl font-bold text-fg">{riskScore}</p>
            <p className="mt-1 text-sm text-fg-muted">
              Current review level: <span className="font-semibold">{riskLevel}</span>. Higher scores trigger more moderation, not automatic penalties.
            </p>
          </div>
        </div>

        {children}
      </CardContent>
    </Card>
  );
}
