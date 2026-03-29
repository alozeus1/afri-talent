import { fireEvent, render, screen } from "@testing-library/react";
import { CandidatePreferenceCenter } from "../candidate-preference-center";

const preferences = {
  id: "pref-1",
  userId: "user-1",
  savedSearchAlerts: true,
  weeklyDigests: true,
  applicationReminders: true,
  profileCompletionNudges: true,
  verificationCompletionNudges: false,
  visaRelocationAlerts: true,
  salaryInsights: true,
  interviewPrepRecommendations: true,
  interviewReminders: true,
  applicationUpdates: true,
  subscriptionNotices: true,
  marketing: false,
  maxNotificationsPerWeek: 6,
  minimumHoursBetweenNotifications: 18,
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T00:00:00.000Z",
};

describe("CandidatePreferenceCenter", () => {
  it("renders grouped preferences and lifecycle checklist actions", () => {
    const onToggle = jest.fn();
    const onSetMaxNotifications = jest.fn();
    const onSetMinimumHours = jest.fn();

    render(
      <CandidatePreferenceCenter
        preferences={preferences}
        journeys={[
          {
            key: "saved_search",
            title: "Create a saved search",
            description: "Turn your preferences into a trusted job feed.",
            status: "READY",
            href: "/candidate/saved-searches",
            ctaLabel: "Create alert",
            priority: 1,
          },
          {
            key: "verification_completion",
            title: "Verification signals are strong",
            description: "Premium employers can trust this faster.",
            status: "DONE",
            href: "/candidate/trust",
            ctaLabel: "Review trust profile",
            priority: 2,
          },
        ]}
        onToggle={onToggle}
        onSetMaxNotifications={onSetMaxNotifications}
        onSetMinimumHours={onSetMinimumHours}
      />,
    );

    expect(screen.getByText("Notification preferences")).toBeInTheDocument();
    expect(screen.getByText("Weekly digest")).toBeInTheDocument();
    expect(screen.getByText("Lifecycle checklist")).toBeInTheDocument();
    expect(screen.getByText("Create a saved search")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Weekly digest"));
    expect(onToggle).toHaveBeenCalledWith("weeklyDigests", false);

    fireEvent.change(screen.getByDisplayValue("6 per week"), {
      target: { value: "8" },
    });
    expect(onSetMaxNotifications).toHaveBeenCalledWith(8);

    fireEvent.change(screen.getByDisplayValue("18 hours"), {
      target: { value: "24" },
    });
    expect(onSetMinimumHours).toHaveBeenCalledWith(24);
  });
});
