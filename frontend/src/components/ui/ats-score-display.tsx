interface ATSScoreDisplayProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ATSScoreDisplay({ score, size = "md" }: ATSScoreDisplayProps) {
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
  const color =
    clampedScore >= 80
      ? "text-green-600"
      : clampedScore >= 60
        ? "text-yellow-600"
        : "text-red-500";
  const bgColor =
    clampedScore >= 80
      ? "bg-green-50 border-green-200"
      : clampedScore >= 60
        ? "bg-yellow-50 border-yellow-200"
        : "bg-red-50 border-red-200";
  const label =
    clampedScore >= 80 ? "Strong Match" : clampedScore >= 60 ? "Good Match" : "Needs Work";
  const sizeClass =
    size === "lg" ? "text-4xl" : size === "sm" ? "text-xl" : "text-3xl";

  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-xl border px-4 py-3 ${bgColor}`}
    >
      <span className={`font-bold ${sizeClass} ${color}`}>{clampedScore}%</span>
      <span className={`text-xs font-medium mt-0.5 ${color}`}>{label}</span>
      <span className="text-xs text-gray-500 mt-0.5">ATS Score</span>
    </div>
  );
}
