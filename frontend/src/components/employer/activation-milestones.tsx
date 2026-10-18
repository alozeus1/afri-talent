"use client";

import { EmployerActivationMilestones, EmployerActivationState } from "@/lib/api";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { Eyebrow, StatusPill } from "./employer-ui";

interface EmployerActivationMilestonesProps {
  milestones: EmployerActivationMilestones;
  activationState: EmployerActivationState;
}

export function EmployerMilestones({
  milestones,
  activationState,
}: EmployerActivationMilestonesProps) {
  const { t, ts, fmt } = useEmployerI18n();
  const items = [
    {
      key: "firstApprovedJobAt",
      label: t("milestones.approved.label"),
      description: t("milestones.approved.description"),
      value: milestones.firstApprovedJobAt,
    },
    {
      key: "firstCandidateViewAt",
      label: t("milestones.view.label"),
      description: t("milestones.view.description"),
      value: milestones.firstCandidateViewAt,
    },
    {
      key: "firstQualifiedShortlistAt",
      label: t("milestones.shortlist.label"),
      description: t("milestones.shortlist.description"),
      value: milestones.firstQualifiedShortlistAt,
    },
  ] as const;

  return (
    <section className="space-y-4">
      <div>
        <Eyebrow>{t("milestones.eyebrow")}</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold text-fg">{ts(activationState.label)}</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => {
          const reached = Boolean(item.value);
          return (
            <div
              key={item.key}
              className={`rounded-2xl border p-5 ${
                reached ? "border-success-line bg-success-soft" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-fg">{item.label}</p>
                <StatusPill tone={reached ? "success" : "neutral"}>
                  {reached ? t("milestones.reached") : t("common.pending")}
                </StatusPill>
              </div>
              <p className="mt-2 text-sm text-fg-secondary">{item.description}</p>
              <p className="mt-4 text-sm font-medium text-fg">
                {item.value ? fmt.date(item.value) : t("milestones.notReached")}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
