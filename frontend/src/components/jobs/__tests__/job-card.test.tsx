import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobCard, MAX_CARD_SIGNALS, selectCardSignals } from "../job-card";
import { ApiError, Job } from "@/lib/api";

const saveMock = jest.fn();
const unsaveMock = jest.fn();

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    savedJobs: {
      ...actual.savedJobs,
      save: (id: string) => saveMock(id),
      unsave: (id: string) => unsaveMock(id),
    },
  };
});

const job: Job = {
  id: "job-1",
  title: "Senior Backend Engineer",
  slug: "senior-backend-engineer",
  description: "Build resilient APIs for global talent products.",
  location: "Remote - Europe",
  type: "full-time",
  seniority: "Senior",
  salaryMin: 80000,
  salaryMax: 120000,
  currency: "USD",
  salaryPeriod: "monthly",
  tags: ["Node.js", "PostgreSQL"],
  visaSponsorship: "YES",
  relocationAssistance: true,
  eligibleCountries: ["NG", "KE"],
  status: "PUBLISHED",
  publishedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  rankingExplanation: {
    score: 92,
    summary: "Recently refreshed job listing • Verified or reviewed employer • Salary range is disclosed",
    reasons: [],
    matchedPreferences: ["typescript"],
    components: {
      relevance: 90,
      freshness: 88,
      applicationLikelihood: 84,
      employerTrust: 82,
      salaryTransparency: 100,
      mobilityRelevance: 74,
      candidatePreferenceMatch: 77,
      quality: 86,
    },
  },
  discovery: {
    qualityScore: 86,
    freshnessScore: 88,
    applicationLikelihoodScore: 84,
    trustedJob: true,
    stale: false,
    freshnessLabel: "RECENT",
    qualityLabel: "TRUSTED",
    salaryTransparent: true,
    verifiedEmployer: true,
    visaClear: true,
    relocationClear: true,
    validApplicationPath: true,
    verifiedApplyPath: true,
    trustedSource: true,
    applyPathType: "ATS",
    sourceVerification: "ATS_PRIMARY",
    deliveryModel: "EXTERNAL_ATS",
    sourceCount: 2,
    sourceNames: ["Greenhouse", "RemoteOK"],
    lastSeenAt: "2026-01-02T00:00:00.000Z",
  },
  sourceLineage: [
    {
      source: "GREENHOUSE",
      sourceId: "src-1",
      sourceUrl: "https://example.com/jobs/1",
      applicationUrl: "https://example.com/jobs/1/apply",
      company: "AfriTalent Labs",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-02T00:00:00.000Z",
    },
    {
      source: "REMOTEOK",
      sourceId: "src-2",
      sourceUrl: "https://remoteok.com/jobs/1",
      applicationUrl: "https://remoteok.com/jobs/1/apply",
      company: "AfriTalent Labs",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-02T00:00:00.000Z",
    },
  ],
  trust: {
    riskLevel: "LOW",
    riskScore: 10,
    jobQualityChecked: true,
    companyReviewed: true,
    newEmployerCaution: false,
    publishedRecently: true,
    guidance: "This job has passed AfriTalent trust checks.",
    employerMemberSince: "2025-01-01T00:00:00.000Z",
    employer: null,
  },
  employer: {
    companyName: "AfriTalent Labs",
    location: "Remote",
    website: "https://afritalent.example.com",
  },
};

describe("JobCard", () => {
  beforeEach(() => {
    saveMock.mockReset();
    unsaveMock.mockReset();
  });

  it("shows at most three signals, counting the salary line as one", () => {
    render(<JobCard job={job} />);

    // Salary + visa (mobility) + freshness = three signals.
    expect(screen.getByText(/USD/)).toBeInTheDocument();
    expect(screen.getByText("Visa sponsored")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    const signals = screen.getByTestId("job-card-signals");
    expect(signals.children).toHaveLength(MAX_CARD_SIGNALS - 1);
    expect(screen.queryByText("Trusted job")).not.toBeInTheDocument();
    expect(screen.queryByText("Relocation support")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Senior Backend Engineer/i })).toHaveAttribute(
      "href",
      "/en/jobs/senior-backend-engineer",
    );
  });

  it("drops the boilerplate ranking sentence, tags and discovery pills", () => {
    render(<JobCard job={job} />);
    expect(screen.queryByText(/Recently refreshed job listing/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Salary disclosed")).not.toBeInTheDocument();
    expect(screen.queryByText("Direct ATS apply")).not.toBeInTheDocument();
    expect(screen.queryByText("Node.js")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cross-checked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Why this looks credible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-01-02/)).not.toBeInTheDocument();
  });

  it("keeps the company and location line", () => {
    render(<JobCard job={job} />);
    expect(screen.getByText("AfriTalent Labs")).toBeInTheDocument();
    expect(screen.getByText(/Remote - Europe/)).toBeInTheDocument();
  });

  it("shows a relative posted label after mount", async () => {
    render(<JobCard job={{ ...job, publishedAt: new Date().toISOString() }} />);
    expect(await screen.findByText("Posted today")).toBeInTheDocument();
  });

  it("hides the company line when the company is unknown", () => {
    render(<JobCard job={{ ...job, employer: { companyName: "", location: "Remote" }, sourceName: undefined }} />);
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
    expect(screen.queryByText("AfriTalent Labs")).not.toBeInTheDocument();
  });

  it("prefers Hires from Africa over the visa signal", () => {
    render(<JobCard job={{ ...job, hiresFromAfrica: true }} />);
    expect(screen.getByText("Hires from Africa")).toBeInTheDocument();
    expect(screen.queryByText("Visa sponsored")).not.toBeInTheDocument();
    expect(screen.queryByText("Open to Africa")).not.toBeInTheDocument();
  });

  it("always keeps a caution signal (Expired wins) without pulsing", () => {
    const { container } = render(
      <JobCard
        job={{
          ...job,
          eligibleCountries: ["DE", "US"],
          isExpired: true,
          trust: { ...job.trust!, newEmployerCaution: true },
        }}
      />,
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Region-restricted")).not.toBeInTheDocument();
    expect(screen.queryByText("New employer review")).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("fills three badge slots by priority when no salary is disclosed", () => {
    const signals = selectCardSignals(
      {
        ...job,
        hiresFromAfrica: true,
        eligibleCountries: ["DE"],
        trust: { ...job.trust!, newEmployerCaution: true },
      },
      { hasSalary: false },
    );
    expect(signals.map((s) => s.key)).toEqual(["new-employer", "hires-from-africa", "fresh"]);
  });

  it("uses only two badge slots when the salary line is shown", () => {
    const signals = selectCardSignals(job, { hasSalary: true });
    expect(signals.map((s) => s.key)).toEqual(["visa", "fresh"]);
  });

  it("persists the heart optimistically via savedJobs", async () => {
    saveMock.mockResolvedValue({ saved: { id: "s1", jobId: "job-1" } });
    render(<JobCard job={job} />);

    fireEvent.click(screen.getByRole("button", { name: "Save job" }));
    expect(screen.getByRole("button", { name: "Remove saved job" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("job-1"));
  });

  it("unsaves when initially saved and rolls back on failure", async () => {
    unsaveMock.mockRejectedValue(new ApiError("boom", 500));
    render(<JobCard job={job} initialSaved />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove saved job" }));
    });
    expect(unsaveMock).toHaveBeenCalledWith("job-1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove saved job" })).toHaveAttribute("aria-pressed", "true"),
    );
  });
});
