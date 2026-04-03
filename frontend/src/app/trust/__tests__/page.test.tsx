import { render, screen } from "@testing-library/react";
import TrustCenterPage from "../page";

describe("TrustCenterPage", () => {
  it("explains employer verification and reporting", () => {
    render(<TrustCenterPage />);

    expect(
      screen.getByText("How AfriTalent makes hiring feel real, safer, and professionally run"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Employer verification" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Report suspicious activity" }).length,
    ).toBeGreaterThan(0);
  });
});
