import { render, screen } from "@testing-library/react";
import { EmployerActivationChecklist } from "../activation-checklist";

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => "en",
  localizePath: (path: string) => `/en${path}`,
}));

describe("EmployerActivationChecklist", () => {
  it("renders progress, checklist items, and next action guidance", () => {
    render(
      <EmployerActivationChecklist
        completionPct={57}
        currentStep="candidate_filters"
        nextAction={{
          key: "candidate_filters",
          title: "Save candidate filters",
          body: "Define skill and location filters so shortlist quality improves.",
          href: "/employer/onboarding",
          ctaLabel: "Continue",
        }}
        checklist={[
          {
            key: "company_setup",
            label: "Complete company setup",
            description: "Tell candidates who you are.",
            done: true,
            href: "/employer/onboarding",
          },
          {
            key: "candidate_filters",
            label: "Save candidate filters",
            description: "Reduce noisy applications early.",
            done: false,
            href: "/employer/onboarding",
          },
        ]}
      />,
    );

    expect(screen.getByText("57% complete")).toBeInTheDocument();
    expect(screen.getByText("Current focus: Candidate filters")).toBeInTheDocument();
    expect(screen.getAllByText("Save candidate filters")).toHaveLength(2);
    expect(screen.getByText("Define skill and location filters so shortlist quality improves.")).toBeInTheDocument();
  });
});
