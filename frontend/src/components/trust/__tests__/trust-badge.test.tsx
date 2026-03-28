import { render, screen } from "@testing-library/react";
import { TrustBadge, trustVariantFromRisk } from "../trust-badge";

describe("TrustBadge", () => {
  it("maps higher risk levels to stronger visual variants", () => {
    expect(trustVariantFromRisk("HIGH", "info")).toBe("danger");
    expect(trustVariantFromRisk("CRITICAL", "success")).toBe("danger");
    expect(trustVariantFromRisk("MEDIUM", "success")).toBe("warning");
    expect(trustVariantFromRisk("LOW", "success")).toBe("success");
  });

  it("renders the trust label", () => {
    render(<TrustBadge label="Company reviewed" riskLevel="LOW" variant="info" />);
    expect(screen.getByText("Company reviewed")).toBeInTheDocument();
  });
});
