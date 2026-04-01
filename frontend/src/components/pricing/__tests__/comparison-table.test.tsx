import { render, screen, fireEvent } from "@testing-library/react";
import { ComparisonTable } from "../comparison-table";

const testRows = [
  { feature: "Job browsing", values: { Free: true, Basic: true, Pro: true } },
  { feature: "Applications", values: { Free: "5/mo", Basic: "Unlimited", Pro: "Unlimited" } },
  { feature: "AI Resume", values: { Free: false, Basic: "10/mo", Pro: "Unlimited" } },
  { feature: "Priority support", tooltip: "Dedicated support channel", values: { Free: false, Basic: false, Pro: true } },
  { feature: "Feature 5", values: { Free: false, Basic: true, Pro: true } },
  { feature: "Feature 6", values: { Free: false, Basic: true, Pro: true } },
  { feature: "Feature 7", values: { Free: false, Basic: false, Pro: true } },
  { feature: "Feature 8", values: { Free: false, Basic: false, Pro: true } },
];

describe("ComparisonTable", () => {
  it("renders table title", () => {
    render(<ComparisonTable title="Candidate Plans" plans={["Free", "Basic", "Pro"]} rows={testRows} tableType="candidate" />);
    expect(screen.getByText("Candidate Plans")).toBeInTheDocument();
  });

  it("renders plan column headers on desktop", () => {
    render(<ComparisonTable title="Test" plans={["Free", "Basic", "Pro"]} rows={testRows} tableType="candidate" />);
    // Desktop table headers
    const headers = screen.getAllByText("Free");
    expect(headers.length).toBeGreaterThan(0);
  });

  it("shows first 6 rows by default when more than 6 exist", () => {
    render(<ComparisonTable title="Test" plans={["Free", "Basic", "Pro"]} rows={testRows} tableType="candidate" />);
    expect(screen.getByText("Show all 8 features")).toBeInTheDocument();
  });

  it("expands to show all features when clicked", () => {
    render(<ComparisonTable title="Test" plans={["Free", "Basic", "Pro"]} rows={testRows} tableType="candidate" />);
    fireEvent.click(screen.getByText("Show all 8 features"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
    expect(screen.getAllByText("Feature 8").length).toBeGreaterThan(0);
  });

  it("renders badges for string values", () => {
    render(<ComparisonTable title="Test" plans={["Free", "Basic", "Pro"]} rows={testRows} tableType="candidate" />);
    expect(screen.getAllByText("5/mo").length).toBeGreaterThan(0);
  });

  it("has correct test id", () => {
    render(<ComparisonTable title="Test" plans={["Free"]} rows={[]} tableType="employer" />);
    expect(screen.getByTestId("comparison-table-employer")).toBeInTheDocument();
  });
});
