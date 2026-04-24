import { render, screen, waitFor } from "@testing-library/react";
import CandidateAnalyticsPage from "../analytics/page";

const push = jest.fn();
const profileViewsMock = jest.fn();
const applicationFunnelMock = jest.fn();
const retentionSummaryMock = jest.fn();
const summaryViewedMock = jest.fn();
const experimentExposedMock = jest.fn();
const weeklyDigestViewedMock = jest.fn();

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
  candidateAnalytics: {
    profileViews: (...args: unknown[]) => profileViewsMock(...args),
    applicationFunnel: (...args: unknown[]) => applicationFunnelMock(...args),
    retentionSummary: (...args: unknown[]) => retentionSummaryMock(...args),
  },
}));

jest.mock("@/lib/analytics", () => ({
  candidateRetentionEvents: {
    summaryViewed: (...args: unknown[]) => summaryViewedMock(...args),
    experimentExposed: (...args: unknown[]) => experimentExposedMock(...args),
    weeklyDigestViewed: (...args: unknown[]) => weeklyDigestViewedMock(...args),
    journeyCtaClicked: jest.fn(),
    recommendationClicked: jest.fn(),
  },
}));

jest.mock("@/components/jobs/job-card", () => ({
  JobCard: ({ job }: { job: { title: string } }) => <div>{job.title}</div>,
}));

describe("CandidateAnalyticsPage", () => {
  beforeEach(() => {
    push.mockReset();
    profileViewsMock.mockReset();
    applicationFunnelMock.mockReset();
    retentionSummaryMock.mockReset();
    summaryViewedMock.mockReset();
    experimentExposedMock.mockReset();
    weeklyDigestViewedMock.mockReset();

    profileViewsMock.mockResolvedValue({
      totalViews: 18,
      viewsByWeek: [
        { week: "2026-W09", count: 2 },
        { week: "2026-W10", count: 4 },
        { week: "2026-W11", count: 5 },
        { week: "2026-W12", count: 7 },
      ],
      viewerRoleBreakdown: {
        EMPLOYER: 12,
        RECRUITER: 6,
      },
    });

    applicationFunnelMock.mockResolvedValue({
      totalApplied: 9,
      reviewing: 3,
      shortlisted: 2,
      accepted: 1,
      rejected: 2,
    });

    retentionSummaryMock.mockResolvedValue({
      snapshot: {
        profileCompleteness: 88,
        trustScore: 74,
        verificationLevel: "PHONE_VERIFIED",
        savedSearchCount: 3,
        openApplications: 4,
        notificationBudgetRemaining: 2,
        lastDigestAt: "2026-03-27T12:00:00.000Z",
        notificationCadenceHours: 24,
        maxNotificationsPerWeek: 6,
      },
      recommendations: [
        {
          id: "job-1",
          title: "Senior Backend Engineer",
          slug: "senior-backend-engineer",
          description: "Build resilient APIs",
          location: "Lagos, Nigeria",
          type: "Full-time",
          seniority: "Senior",
          salaryMin: 80000,
          salaryMax: 120000,
          currency: "USD",
          salaryPeriod: "YEAR",
          tags: ["Node.js", "PostgreSQL"],
          visaSponsorship: "YES",
          relocationAssistance: true,
          status: "PUBLISHED",
          createdAt: "2026-03-28T00:00:00.000Z",
          employer: {
            companyName: "Verified Global Tech",
            location: "Remote",
            trust: {
              badge: "Manual-review approved",
              riskLevel: "LOW",
            },
          },
          discovery: {
            freshnessLabel: "ACTIVE",
            freshnessScore: 91,
            qualityScore: 87,
            trustedJob: true,
            sourceCount: 2,
            salaryTransparent: true,
            visaClear: true,
            lastSeenAt: "2026-03-28T00:00:00.000Z",
          },
        },
      ],
      weeklyDigest: {
        headline: "High-signal roles matched to your trust profile",
        trustedJobCount: 5,
        verifiedEmployerCount: 4,
        salaryTransparentCount: 3,
        visaFriendlyCount: 2,
        freshnessWindowLabel: "Updated in the last 72 hours",
        jobs: [
          {
            id: "job-2",
            title: "Platform Engineer",
            slug: "platform-engineer",
            description: "Scale cloud systems",
            location: "Nairobi, Kenya",
            type: "Full-time",
            seniority: "Mid",
            tags: ["AWS"],
            status: "PUBLISHED",
            createdAt: "2026-03-28T00:00:00.000Z",
            employer: {
              companyName: "Trusted Hiring Co",
              location: "Nairobi",
            },
            discovery: {
              freshnessLabel: "ACTIVE",
              freshnessScore: 89,
              qualityScore: 82,
              trustedJob: true,
              sourceCount: 1,
              salaryTransparent: true,
              visaClear: false,
              lastSeenAt: "2026-03-28T00:00:00.000Z",
            },
          },
        ],
      },
      journeys: [
        {
          key: "saved_search",
          title: "Create a saved search",
          description: "Turn your best search into a repeatable signal.",
          status: "READY",
          href: "/candidate/saved-searches",
          ctaLabel: "Create alert",
          priority: 1,
        },
      ],
      experiments: [
        {
          key: "digest_hero_v1",
          variant: "control",
        },
      ],
      preferences: {
        weeklyDigests: true,
        savedSearchAlerts: true,
        applicationReminders: true,
        profileCompletionNudges: true,
        verificationCompletionNudges: true,
        visaRelocationAlerts: true,
        salaryInsights: true,
        interviewPrepRecommendations: true,
        maxNotificationsPerWeek: 6,
        minimumHoursBetweenNotifications: 18,
      },
    });
  });

  it("renders the retention analytics experience and fires analytics exposure events", async () => {
    render(<CandidateAnalyticsPage />);

    expect(await screen.findByText("Retention control tower")).toBeInTheDocument();
    expect(screen.getByText("Weekly digest preview")).toBeInTheDocument();
    expect(screen.getByText("High-signal roles matched to your trust profile")).toBeInTheDocument();
    expect(screen.getByText("Platform Engineer")).toBeInTheDocument();
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();

    await waitFor(() => {
      expect(summaryViewedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          surface: "candidate_analytics",
          recommendation_count: 1,
          saved_search_count: 3,
        }),
      );
    });

    expect(experimentExposedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "candidate_analytics",
        experiment_key: "digest_hero_v1",
        variant: "control",
      }),
    );

    expect(weeklyDigestViewedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "candidate_analytics",
        digest_job_count: 1,
        verified_employer_count: 4,
      }),
    );
  });
});
