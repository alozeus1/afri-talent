import { fireEvent, render, screen } from "@testing-library/react";
import { NetworkStatusBanner } from "../network-status-banner";

const refresh = jest.fn();
const useNetworkProfileMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock("@/lib/network-profile", () => ({
  useNetworkProfile: () => useNetworkProfileMock(),
}));

describe("NetworkStatusBanner", () => {
  beforeEach(() => {
    refresh.mockReset();
    useNetworkProfileMock.mockReset();
  });

  it("shows offline recovery state and retries the page", () => {
    useNetworkProfileMock.mockReturnValue({
      online: false,
      saveData: false,
      effectiveType: null,
      isLowBandwidth: false,
    });

    render(<NetworkStatusBanner />);

    expect(screen.getByText("You're offline right now.", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows lite network messaging on constrained connections", () => {
    useNetworkProfileMock.mockReturnValue({
      online: true,
      saveData: true,
      effectiveType: "3g",
      isLowBandwidth: true,
    });

    render(<NetworkStatusBanner />);

    expect(screen.getByText("Lite network mode is active.")).toBeInTheDocument();
  });
});
