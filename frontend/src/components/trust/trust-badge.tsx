import { Badge } from "@/components/ui/badge";
import { TrustRiskLevel } from "@/lib/api";

export function trustVariantFromRisk(
  riskLevel?: TrustRiskLevel | null,
  fallback: "default" | "success" | "warning" | "danger" | "info" = "info",
) {
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") {
    return "danger" as const;
  }
  if (riskLevel === "MEDIUM") {
    return "warning" as const;
  }
  return fallback;
}

interface TrustBadgeProps {
  label: string;
  riskLevel?: TrustRiskLevel | null;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function TrustBadge({ label, riskLevel, variant = "info", className = "" }: TrustBadgeProps) {
  return (
    <Badge variant={trustVariantFromRisk(riskLevel, variant)} className={className}>
      {label}
    </Badge>
  );
}
