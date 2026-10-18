import { render, screen } from "@testing-library/react";
import SavedJobsPage from "../saved-jobs/page";
import { CANDIDATE_MESSAGES } from "@/lib/i18n/candidate-messages";

let pathname = "/en/candidate/saved-jobs";
const listMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => pathname,
}));

jest.mock("@/lib/api", () => ({
  savedJobs: {
    list: (...args: unknown[]) => listMock(...args),
    unsave: jest.fn(),
  },
}));

jest.mock("@/lib/job-trust-labels", () => ({ africaPill: () => null }));

describe("SavedJobsPage localisation", () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({ saved: [] });
  });

  it.each(["en", "fr", "pt", "ar"] as const)("renders the empty state in %s", async (locale) => {
    pathname = `/${locale}/candidate/saved-jobs`;
    render(<SavedJobsPage />);
    expect(await screen.findByText(CANDIDATE_MESSAGES[locale]["savedJobs.emptyTitle"])).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(CANDIDATE_MESSAGES[locale]["savedJobs.title"]);
  });

  it("shows a translated, retryable error instead of an empty list when loading fails", async () => {
    pathname = "/fr/candidate/saved-jobs";
    listMock.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    render(<SavedJobsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(CANDIDATE_MESSAGES.fr["ui.error.server.description"]);
    expect(screen.getByRole("button", { name: CANDIDATE_MESSAGES.fr["ui.tryAgain"] })).toBeInTheDocument();
  });
});
