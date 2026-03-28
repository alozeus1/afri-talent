import { render, screen } from "@testing-library/react";
import TrustCenterPage from "../page";

describe("TrustCenterPage", () => {
  it("explains employer verification and reporting", () => {
    render(<TrustCenterPage />);

    expect(
      screen.getByText("How AfriTalent keeps hiring safer and more credible"),
    ).toBeInTheDocument();
    expect(screen.getByText("Employer verification")).toBeInTheDocument();
    expect(screen.getByText("Report suspicious activity")).toBeInTheDocument();
  });
});
