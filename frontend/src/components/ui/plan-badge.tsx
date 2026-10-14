import { Badge } from "@/components/ui/badge";
import { FREE_MODE } from "@/lib/free-mode";

interface PlanBadgeProps {
  /** Label shown when billing is on (free mode always shows "Included free"). */
  label?: string;
  className?: string;
}

/** "Premium" tier badge that becomes "Included free" during the free launch. */
export function PlanBadge({ label = "Premium", className }: PlanBadgeProps) {
  if (FREE_MODE) {
    return (
      <Badge variant="success" className={className}>
        Included free
      </Badge>
    );
  }
  return (
    <Badge variant="info" className={className}>
      {label}
    </Badge>
  );
}
