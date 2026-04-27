import { render, screen } from "@testing-library/react";
import { JobsBrowseExperience } from "../jobs-browse-experience";
import { Job, JobListResponse } from "@/lib/api";

const replace = jest.fn();
const useNetworkProfileMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace,
    refresh: jest.fn(),
  }),
  usePathname: () => "/en/jobs",
}));

jest.mock("@/lib/network-profile", () => ({
  useNetworkProfile: () => useNetworkProfileMock(),
}));

jest.mock("@/lib/analytics", () => ({
  jobDiscoveryEvents: {
    resultsLoaded: jest.fn(),
    resultClicked: jest.fn(),
  },
}));

const { jobDiscoveryEvents } = jest.requireMock("@/lib/analytics") as {
  jobDiscoveryEvents: {
    resultsLoaded: jest.Mock;
  };
};
const resultsLoaded = jobDiscoveryEvents.resultsLoaded;

const job: Job = {
  id: "job-1",
  title: "Data Science Manager",
  slug: "data-science-manager",
  description: "Build machine learning systems.",
  location: "Remote - United States",
  type: "Full-time",
  seniority: "Lead",
  tags: ["Python", "ML"],
  status: "PUBLISHED",
  createdAt: "2026-04-08T00:00:00.000Z",
  employer: {
    companyName: "reddit",
    location: "Remote",
  },
  trust: {
    riskLevel: "LOW",
    riskScore: 8,
    jobQualityChecked: true,
    companyReviewed: false,
    newEmployerCaution: true,
    publishedRecently: true,
    guidance: "Looks credible.",
    employer: null,
    employerMemberSince: null,
  },
  discovery: {
    qualityScore: 70,
    freshnessScore: 88,
    applicationLikelihoodScore: 74,
    trustedJob: false,
    stale: false,
    freshnessLabel: "FRESH",
    qualityLabel: "REVIEW",
    salaryTransparent: false,
    verifiedEmployer: false,
    visaClear: false,
    relocationClear: false,
    validApplicationPath: true,
    verifiedApplyPath: true,
    trustedSource: true,
    applyPathType: "ATS",
    sourceVerification: "ATS_PRIMARY",
    deliveryModel: "EXTERNAL_ATS",
    sourceCount: 1,
    sourceNames: ["GREENHOUSE"],
    lastSeenAt: "2026-04-08T00:00:00.000Z",
  },
  rankingExplanation: {
    score: 70,
    summary: "Recently refreshed job listing",
    reasons: ["Recently refreshed job listing"],
    matchedPreferences: [],
    components: {
      relevance: 70,
      freshness: 88,
      applicationLikelihood: 74,
      employerTrust: 45,
      salaryTransparency: 0,
      mobilityRelevance: 50,
      candidatePreferenceMatch: 50,
      quality: 70,
    },
  },
};

const pagination: JobListResponse["pagination"] = {
  page: 1,
  limit: 12,
  total: 24,
  totalPages: 2,
};

describe("JobsBrowseExperience", () => {
  beforeEach(() => {
    replace.mockReset();
    resultsLoaded.mockReset();
    useNetworkProfileMock.mockReturnValue({
      online: true,
      saveData: false,
      effectiveType: "4g",
      isLowBandwidth: false,
    });
  });

  it("renders visible results with localized pagination links", () => {
    render(
      <JobsBrowseExperience
        filters={{
          search: "manager",
          location: "",
          type: "",
          jobField: "",
          workplaceType: "",
          seniority: "",
          visaSponsorship: "",
          relocationAssistance: "",
          remote: "true",
          page: 1,
          limit: 12,
        }}
        jobs={[job]}
        pagination={{ ...pagination, total: 1, totalPages: 1 }}
        error={null}
        resultMetrics={{
          totalResults: 1,
          visibleResults: 1,
          trustedResults: 0,
          freshResults: 1,
        }}
      />,
    );

    expect(screen.getByText("Data Science Manager")).toBeVisible();
    expect(screen.getByRole("link", { name: /Data Science Manager/i })).toHaveAttribute(
      "href",
      "/en/jobs/data-science-manager",
    );
  });

  it("shows a generic error state without leaking raw server text", () => {
    render(
      <JobsBrowseExperience
        filters={{
          search: "devops",
          location: "Nigeria",
          type: "",
          jobField: "",
          workplaceType: "",
          seniority: "",
          visaSponsorship: "",
          relocationAssistance: "",
          remote: "",
          page: 1,
          limit: 12,
        }}
        jobs={[]}
        pagination={{ ...pagination, total: 0, totalPages: 1 }}
        error="Too many requests, please try again later"
      />,
    );

    expect(screen.getByText("We couldn't load the latest roles just now.")).toBeInTheDocument();
    expect(screen.queryByText("Too many requests, please try again later")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of/i)).not.toBeInTheDocument();
  });

  it("shows a localized clear-filters action for empty filtered searches", () => {
    render(
      <JobsBrowseExperience
        filters={{
          search: "staff designer",
          location: "Kenya",
          type: "",
          jobField: "",
          workplaceType: "",
          seniority: "",
          visaSponsorship: "",
          relocationAssistance: "",
          remote: "",
          page: 1,
          limit: 12,
        }}
        jobs={[]}
        pagination={{ ...pagination, total: 0, totalPages: 1 }}
        error={null}
        resultMetrics={{
          totalResults: 0,
          visibleResults: 0,
          trustedResults: 0,
          freshResults: 0,
        }}
      />,
    );

    expect(screen.getByText("No roles matched this search yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/en/jobs");
  });

  it("renders localized next-page navigation when more results exist", () => {
    render(
      <JobsBrowseExperience
        filters={{
          search: "manager",
          location: "",
          type: "",
          jobField: "",
          workplaceType: "",
          seniority: "",
          visaSponsorship: "",
          relocationAssistance: "",
          remote: "true",
          page: 1,
          limit: 12,
        }}
        jobs={[job]}
        pagination={pagination}
        error={null}
        resultMetrics={{
          totalResults: 24,
          visibleResults: 1,
          trustedResults: 0,
          freshResults: 1,
        }}
      />,
    );

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/en/jobs?search=manager&remote=true&page=2",
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
