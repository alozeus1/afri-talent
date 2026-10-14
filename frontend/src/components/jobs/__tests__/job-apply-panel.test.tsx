import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Job } from "@/lib/api";
import { JobApplyPanel } from "../job-apply-panel";

const myApplicationsMock = jest.fn();
const applyMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/en/jobs/backend-engineer",
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "cand-1", role: "CANDIDATE", name: "Ada", email: "ada@example.com" },
    isLoading: false,
  }),
}));

jest.mock("@/lib/network-profile", () => ({
  useNetworkProfile: () => ({ online: true, isLowBandwidth: false }),
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => "en",
  localizePath: (path: string, locale: string) => `/${locale}${path}`,
}));

// Render the Quick Apply modal as a simple marker so the test can assert the
// primary CTA opens it (instead of posting a bare application).
jest.mock("next/dynamic", () => () => {
  const QuickApplyModalStub = ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess: () => void }) =>
    isOpen ? (
      <div data-testid="quick-apply-modal">
        <button type="button" onClick={onSuccess}>
          stub-submit
        </button>
      </div>
    ) : null;
  return QuickApplyModalStub;
});

jest.mock("@/lib/api", () => ({
  applications: {
    my: (...args: unknown[]) => myApplicationsMock(...args),
    apply: (...args: unknown[]) => applyMock(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const job = {
  id: "job-1",
  slug: "backend-engineer",
  title: "Backend Engineer",
  jobSource: "EMPLOYER_POSTED",
  discovery: { deliveryModel: "ON_PLATFORM" },
} as unknown as Job;

describe("JobApplyPanel", () => {
  beforeEach(() => {
    myApplicationsMock.mockReset();
    applyMock.mockReset();
  });

  it("shows the persisted 'Applied on' state when the candidate already applied", async () => {
    myApplicationsMock.mockResolvedValue([
      { id: "app-1", createdAt: "2026-10-01T10:00:00.000Z", status: "PENDING", job: { id: "job-1" } },
    ]);
    render(<JobApplyPanel job={job} />);

    const applied = await screen.findByTestId("job-applied-state");
    expect(applied).toBeDisabled();
    expect(applied.textContent).toMatch(/^Applied on /);
    expect(screen.getByRole("link", { name: /track this application/i })).toHaveAttribute(
      "href",
      "/en/candidate/applications",
    );
    expect(screen.queryByRole("button", { name: /apply now/i })).not.toBeInTheDocument();
  });

  it("opens Quick Apply from the primary CTA and keeps the applied state after success", async () => {
    myApplicationsMock.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<JobApplyPanel job={job} />);

    await waitFor(() => expect(myApplicationsMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^quick apply$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply now/i }));
    expect(applyMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("quick-apply-modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "stub-submit" }));
    expect(await screen.findByTestId("job-applied-state")).toBeDisabled();
  });
});
