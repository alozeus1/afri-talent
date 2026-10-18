"use client";

import { useT } from "@/lib/i18n/client";

interface MatchScoreBadgeProps {
  score: number;
}

export function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const t = useT();
  if (score < 50) return null;
  const isStrong = score >= 80;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isStrong ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
      }`}
    >
      {isStrong ? "✦" : "◆"} {t("common.ui.matchPercent", { score })}
    </span>
  );
}
