import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobApplicationsPage from "../jobs/[id]/applications/page";

const forJobMock = jest.fn();
const updateStatusMock = jest.fn();
const cvMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: "job-1" }),
  usePathname: () => "/en/employer/jobs/job-1/applications",
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "emp-1", role: "EMPLOYER", name: "Acme", email: "hr@acme.test" },
    isLoading: false,
  }),
}));

jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => "en",
  localizePath: (path: string, locale: string) => `/${locale}${path}`,
}));

jest.mock("@/lib/analytics", () => ({
  employerOnboardingEvents: { candidateListViewed: jest.fn() },
}));

jest.mock("@/lib/api", () => ({
  applications: {
    forJob: (...args: unknown[]) => forJobMock(...args),
    updateStatus: (...args: unknown[]) => updateStatusMock(...args),
    cv: (...args: unknown[]) => cvMock(...args),
  },
  messages: { createThread: jest.fn() },
}));

const application = {
  id: "app-1",
  status: "PENDING",
  createdAt: "2026-10-01T10:00:00.000Z",
  coverLetter: "I would love to join.",
  job: { id: "job-1", title: "Backend Engineer", slug: "backend-engineer" },
  candidate: {
    id: "cand-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    candidateProfile: {
      headline: "Senior backend engineer",
      skills: ["TypeScript", "Node.js", "Postgres", "AWS", "Docker", "Kafka", "Go", "Rust"],
      yearsExperience: 7,
      linkedinUrl: "linkedin.com/in/ada",
      githubUrl: null,
      portfolioUrl: "javascript:alert(1)",
      profileCompleteness: 85,
    },
    socialProfile: { location: "Lagos, Nigeria" },
  },
};

describe("Employer job applications page", () => {
  beforeEach(() => {
    forJobMock.mockReset().mockResolvedValue([application]);
    updateStatusMock.mockReset().mockResolvedValue({ ...application, status: "REJECTED" });
    cvMock.mockReset();
  });

  it("renders a rich applicant card with top skills and safe profile links", async () => {
    render(<JobApplicationsPage />);
    expect(await screen.findByText("Senior backend engineer")).toBeInTheDocument();
    expect(screen.getByText(/7 yrs experience · Lagos, Nigeria/)).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.queryByText("Go")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/ada");
    expect(screen.queryByRole("link", { name: "Portfolio" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before rejecting", async () => {
    const user = userEvent.setup();
    render(<JobApplicationsPage />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(updateStatusMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateStatusMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Reject application" }));
    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledWith("app-1", { status: "REJECTED" }));
  });

  it("shows CV text in a modal when no file URL is available", async () => {
    cvMock.mockResolvedValue({ text: "Ada Lovelace\nAnalytical Engines" });
    const user = userEvent.setup();
    render(<JobApplicationsPage />);
    await user.click(await screen.findByRole("button", { name: "View CV" }));
    expect(cvMock).toHaveBeenCalledWith("app-1");
    expect(await screen.findByTestId("cv-text")).toHaveTextContent("Analytical Engines");
  });

  it("opens the CV URL in a new tab when one is returned", async () => {
    cvMock.mockResolvedValue({ url: "https://s3.example.com/signed" });
    const openSpy = jest.spyOn(window, "open").mockReturnValue({ opener: {} } as Window);
    const user = userEvent.setup();
    render(<JobApplicationsPage />);
    await user.click(await screen.findByRole("button", { name: "View CV" }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith("https://s3.example.com/signed", "_blank"));
    openSpy.mockRestore();
  });

  it("shows a retry card instead of the empty state when loading fails", async () => {
    forJobMock.mockReset().mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));
    forJobMock.mockResolvedValueOnce([application]);
    const user = userEvent.setup();
    render(<JobApplicationsPage />);

    expect(await screen.findByText("We couldn't load applications for this job.")).toBeInTheDocument();
    expect(screen.queryByText("No applications yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Senior backend engineer")).toBeInTheDocument();
    expect(forJobMock).toHaveBeenCalledTimes(2);
  });

  it("shows inline feedback when a status update fails", async () => {
    updateStatusMock.mockReset().mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const user = userEvent.setup();
    render(<JobApplicationsPage />);

    await user.click(await screen.findByRole("button", { name: "Shortlist" }));
    expect(await screen.findByText(/Status not updated\./)).toBeInTheDocument();
  });
});
