import { render, screen } from "@testing-library/react";
import { EmployerJobPostingPreview } from "../job-posting-preview";

describe("EmployerJobPostingPreview", () => {
  it("renders quality, moderation, and guidance state", () => {
    render(
      <EmployerJobPostingPreview
        preview={{
          qualityScore: 82,
          qualityLabel: "TRUSTED",
          moderationRiskLevel: "LOW",
          moderationRequired: false,
          guidance: "This draft is credible enough to publish quickly.",
          flags: [],
          strengths: ["Compensation transparency improves credibility."],
          tips: ["Clarify visa sponsorship for cross-border candidates."],
          checklist: [
            { key: "salary", label: "Compensation transparency", done: true },
            { key: "mobility", label: "Visa or relocation clarity", done: false },
          ],
        }}
      />,
    );

    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("This draft is credible enough to publish quickly.")).toBeInTheDocument();
    expect(screen.getByText("Compensation transparency")).toBeInTheDocument();
    expect(screen.getByText(/Clarify visa sponsorship for cross-border candidates\./i)).toBeInTheDocument();
  });
});
