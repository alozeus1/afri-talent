import { render, screen } from "@testing-library/react";
import { JobCard } from "../job-card";
import { Job } from "@/lib/api";

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
  it("renders trust and discovery indicators", () => {
    render(<JobCard job={job} />);

    expect(screen.getByText("Trusted job")).toBeInTheDocument();
    expect(screen.getByText("Cross-checked x2")).toBeInTheDocument();
    expect(screen.getByText("Salary disclosed")).toBeInTheDocument();
    expect(screen.getByText("Verified ATS path")).toBeInTheDocument();
    expect(screen.getByText("Direct ATS apply")).toBeInTheDocument();
    expect(screen.getByText(/Recently refreshed job listing/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Senior Backend Engineer/i })).toHaveAttribute(
      "href",
      "/en/jobs/senior-backend-engineer",
    );
  });
});
