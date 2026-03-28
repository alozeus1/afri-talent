import { render, screen, fireEvent } from "@testing-library/react";
import { RegionSelector } from "../region-selector";

describe("RegionSelector", () => {
  it("renders all three regions", () => {
    render(<RegionSelector currentRegion="ROW" onChange={jest.fn()} />);
    expect(screen.getByTestId("region-AFRICA")).toBeInTheDocument();
    expect(screen.getByTestId("region-EUROPE")).toBeInTheDocument();
    expect(screen.getByTestId("region-ROW")).toBeInTheDocument();
  });

  it("shows the current region in the description text", () => {
    render(<RegionSelector currentRegion="AFRICA" onChange={jest.fn()} />);
    expect(screen.getAllByText("Africa").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Pricing shown for/)).toBeInTheDocument();
  });

  it("calls onChange when a different region is clicked", () => {
    const onChange = jest.fn();
    render(<RegionSelector currentRegion="ROW" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("region-AFRICA"));
    expect(onChange).toHaveBeenCalledWith("AFRICA");
  });

  it("does not call onChange when current region is clicked", () => {
    const onChange = jest.fn();
    render(<RegionSelector currentRegion="EUROPE" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("region-EUROPE"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks current region button as pressed", () => {
    render(<RegionSelector currentRegion="AFRICA" onChange={jest.fn()} />);
    expect(screen.getByTestId("region-AFRICA")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("region-EUROPE")).toHaveAttribute("aria-pressed", "false");
  });

  it("has correct test id", () => {
    render(<RegionSelector currentRegion="ROW" onChange={jest.fn()} />);
    expect(screen.getByTestId("region-selector")).toBeInTheDocument();
  });
});
