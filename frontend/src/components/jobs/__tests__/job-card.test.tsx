import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobCard, selectCardBadges } from "../job-card";
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

  it("renders a compact set of trust and discovery indicators", () => {
    render(<JobCard job={job} />);

    // Africa pill first, then the next trust badge by priority — max two.
    expect(screen.getByText("Open to Africa")).toBeInTheDocument();
    expect(screen.getByText("Trusted job")).toBeInTheDocument();
    expect(screen.queryByText("Company reviewed")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified ATS path")).not.toBeInTheDocument();
    expect(screen.getByText("Cross-checked x2")).toBeInTheDocument();
    expect(screen.getByText("Salary disclosed")).toBeInTheDocument();
    expect(screen.getByText("Direct ATS apply")).toBeInTheDocument();
    expect(screen.getByText(/Recently refreshed job listing/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Senior Backend Engineer/i })).toHaveAttribute(
      "href",
      "/en/jobs/senior-backend-engineer",
    );
  });

  it("drops the duplicate visa pill, the credibility line and the raw ISO date", () => {
    render(<JobCard job={job} />);
    expect(screen.getAllByText(/visa/i)).toHaveLength(1);
    expect(screen.queryByText(/Why this looks credible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-01-02/)).not.toBeInTheDocument();
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

  it("suppresses the Africa pill when the Hires from Africa badge already renders", () => {
    render(<JobCard job={{ ...job, hiresFromAfrica: true }} />);
    expect(screen.getByText("Hires from Africa")).toBeInTheDocument();
    expect(screen.queryByText("Open to Africa")).not.toBeInTheDocument();
  });

  it("shows a single caution badge (Expired wins) without pulsing", () => {
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
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("caps badges at two trust plus one caution", () => {
    const { trust, caution } = selectCardBadges({
      ...job,
      hiresFromAfrica: true,
      eligibleCountries: ["DE"],
      trust: { ...job.trust!, newEmployerCaution: true },
    });
    expect(trust.map((b) => b.label)).toEqual(["Hires from Africa", "Trusted job"]);
    expect(caution?.label).toBe("New employer review");
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
