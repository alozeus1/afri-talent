import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CandidateSettingsPage from "../settings/page";

const push = jest.fn();
const exportDataMock = jest.fn();
const requestAccountDeletionMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "candidate-1",
      role: "CANDIDATE",
      name: "Amina",
      email: "amina@example.com",
    },
    isLoading: false,
  }),
}));

jest.mock("@/lib/api", () => ({
  profile: {
    exportData: (...args: unknown[]) => exportDataMock(...args),
    requestAccountDeletion: (...args: unknown[]) => requestAccountDeletionMock(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
}));

describe("CandidateSettingsPage", () => {
  beforeEach(() => {
    push.mockReset();
    exportDataMock.mockReset();
    requestAccountDeletionMock.mockReset();

    // jsdom does not implement object URLs.
    URL.createObjectURL = jest.fn(() => "blob:mock-url");
    URL.revokeObjectURL = jest.fn();
  });

  it("downloads the data export as a JSON file", async () => {
    exportDataMock.mockResolvedValue({
      exportedAt: "2026-07-06T10:00:00.000Z",
      userId: "candidate-1",
      profile: { headline: "Backend engineer" },
      resume: { hasResume: true, updatedAt: "2026-06-01T00:00:00.000Z" },
      applicationCount: 2,
      applicationStatuses: [],
    });
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<CandidateSettingsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));

    await waitFor(() => {
      expect(exportDataMock).toHaveBeenCalledTimes(1);
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Export downloaded/)).toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it("requires the type-to-confirm phrase before deletion can be requested", async () => {
    render(<CandidateSettingsPage />);

    const deleteButton = screen.getByRole("button", { name: "Request account deletion" });
    expect(deleteButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Type/), "DELETE");
    expect(deleteButton).toBeEnabled();
  });

  it("submits the deletion request and shows the requested-at confirmation", async () => {
    requestAccountDeletionMock.mockResolvedValue({
      message: "Deletion request received. Your account will be deleted within 30 days.",
      requestedAt: "2026-07-06T11:30:00.000Z",
    });

    render(<CandidateSettingsPage />);
    await userEvent.type(screen.getByLabelText(/Type/), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Request account deletion" }));

    expect(await screen.findByText(/Deletion requested on/)).toBeInTheDocument();
    expect(screen.getByText(/permanently deleted within 30 days/)).toBeInTheDocument();
    expect(requestAccountDeletionMock).toHaveBeenCalledTimes(1);
  });

  it("shows the already-scheduled message when the backend rejects a duplicate request", async () => {
    // Use the mocked module's ApiError so the page's instanceof check matches.
    const { ApiError } = jest.requireMock("@/lib/api") as {
      ApiError: new (message: string, status: number) => Error;
    };
    requestAccountDeletionMock.mockRejectedValue(
      new ApiError("Account is already scheduled for deletion", 400),
    );

    render(<CandidateSettingsPage />);
    await userEvent.type(screen.getByLabelText(/Type/), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Request account deletion" }));

    expect(
      await screen.findByText(/already scheduled for deletion/),
    ).toBeInTheDocument();
  });
});
