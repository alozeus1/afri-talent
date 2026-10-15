"use client";

import { Card, CardContent } from "@/components/ui/card";
import { EmployerActivationMilestones, EmployerActivationState } from "@/lib/api";

interface EmployerActivationMilestonesProps {
  milestones: EmployerActivationMilestones;
  activationState: EmployerActivationState;
}

function formatMilestone(date: string | null) {
  if (!date) {
    return "Not reached yet";
  }

  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function EmployerMilestones({
  milestones,
  activationState,
}: EmployerActivationMilestonesProps) {
  const items = [
    {
      key: "firstApprovedJobAt",
      label: "First approved job",
      description: "The job is credible enough to pass moderation and go live.",
      value: milestones.firstApprovedJobAt,
    },
    {
      key: "firstCandidateViewAt",
      label: "First candidate view",
      description: "A hiring teammate started reviewing talent in-platform.",
      value: milestones.firstCandidateViewAt,
    },
    {
      key: "firstQualifiedShortlistAt",
      label: "First qualified shortlist",
      description: "You identified your first high-signal applicant worth advancing.",
      value: milestones.firstQualifiedShortlistAt,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-fg-muted">
          First-success milestones
        </p>
        <h2 className="mt-2 text-xl font-semibold text-fg">{activationState.label}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => {
          const reached = Boolean(item.value);
          return (
            <Card
              key={item.key}
              className={reached ? "border-emerald-200 bg-emerald-50/60" : "border-line bg-surface"}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-fg">{item.label}</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      reached ? "bg-emerald-100 text-emerald-700" : "bg-surface-muted text-fg-muted"
                    }`}
                  >
                    {reached ? "Reached" : "Pending"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-fg-secondary">{item.description}</p>
                <p className="mt-4 text-sm font-medium text-fg">{formatMilestone(item.value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
