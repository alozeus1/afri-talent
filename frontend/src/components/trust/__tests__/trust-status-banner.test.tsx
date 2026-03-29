import { render, screen } from "@testing-library/react";
import { TrustStatusBanner } from "../trust-status-banner";

describe("TrustStatusBanner", () => {
  it("renders trust state copy", () => {
    render(
      <TrustStatusBanner
        tone="warning"
        title="Review in progress"
        body="Your latest verification evidence is being assessed."
      />,
    );

    expect(screen.getByText("Review in progress")).toBeInTheDocument();
    expect(
      screen.getByText("Your latest verification evidence is being assessed."),
    ).toBeInTheDocument();
  });
});
