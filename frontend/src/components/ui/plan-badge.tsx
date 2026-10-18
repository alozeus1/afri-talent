"use client";

import { Badge } from "@/components/ui/badge";
import { FREE_MODE } from "@/lib/free-mode";
import { useT } from "@/lib/i18n/client";

interface PlanBadgeProps {
  /** Label shown when billing is on (free mode always shows "Included free"). */
  label?: string;
  className?: string;
}

/** "Premium" tier badge that becomes "Included free" during the free launch. */
export function PlanBadge({ label, className }: PlanBadgeProps) {
  const t = useT();
  if (FREE_MODE) {
    return (
      <Badge variant="success" className={className}>
        {t("common.ui.includedFree")}
      </Badge>
    );
  }
  return (
    <Badge variant="info" className={className}>
      {label ?? t("common.ui.premium")}
    </Badge>
  );
}
