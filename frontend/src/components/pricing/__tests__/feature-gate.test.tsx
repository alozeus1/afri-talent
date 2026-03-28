import { render, screen } from "@testing-library/react";
import { FeatureGate, hasAccess, UpgradeCta } from "../feature-gate";

describe("hasAccess", () => {
  it("grants FREE user access to FREE features", () => {
    expect(hasAccess("FREE", "FREE")).toBe(true);
  });

  it("denies FREE user access to BASIC features", () => {
    expect(hasAccess("FREE", "BASIC")).toBe(false);
  });

  it("denies FREE user access to PROFESSIONAL features", () => {
    expect(hasAccess("FREE", "PROFESSIONAL")).toBe(false);
  });

  it("grants BASIC user access to FREE features", () => {
    expect(hasAccess("BASIC", "FREE")).toBe(true);
  });

  it("grants BASIC user access to BASIC features", () => {
    expect(hasAccess("BASIC", "BASIC")).toBe(true);
  });

  it("denies BASIC user access to PROFESSIONAL features", () => {
    expect(hasAccess("BASIC", "PROFESSIONAL")).toBe(false);
  });

  it("grants PROFESSIONAL user access to all candidate features", () => {
    expect(hasAccess("PROFESSIONAL", "FREE")).toBe(true);
    expect(hasAccess("PROFESSIONAL", "BASIC")).toBe(true);
    expect(hasAccess("PROFESSIONAL", "PROFESSIONAL")).toBe(true);
  });

  it("works for employer plans", () => {
    expect(hasAccess("EMPLOYER_FREE", "EMPLOYER_BASIC")).toBe(false);
    expect(hasAccess("EMPLOYER_BASIC", "EMPLOYER_FREE")).toBe(true);
    expect(hasAccess("EMPLOYER_PREMIUM", "EMPLOYER_BASIC")).toBe(true);
  });
});

describe("FeatureGate", () => {
  it("renders children when user has access", () => {
    render(
      <FeatureGate feature="AI Chat" requiredPlan="BASIC" currentPlan="BASIC">
        <div>Chat UI</div>
      </FeatureGate>,
    );
    expect(screen.getByText("Chat UI")).toBeInTheDocument();
  });

  it("renders upgrade CTA when user lacks access", () => {
    render(
      <FeatureGate feature="AI Auto-Apply" requiredPlan="PROFESSIONAL" currentPlan="FREE">
        <div>Auto Apply UI</div>
      </FeatureGate>,
    );
    expect(screen.queryByText("Auto Apply UI")).not.toBeInTheDocument();
    expect(screen.getByText(/requires Professional/)).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Professional")).toBeInTheDocument();
  });

  it("renders custom fallback when provided and user lacks access", () => {
    render(
      <FeatureGate
        feature="Analytics"
        requiredPlan="EMPLOYER_PREMIUM"
        currentPlan="EMPLOYER_FREE"
        fallback={<div>Custom locked message</div>}
      >
        <div>Analytics Dashboard</div>
      </FeatureGate>,
    );
    expect(screen.queryByText("Analytics Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Custom locked message")).toBeInTheDocument();
  });
});

describe("UpgradeCta", () => {
  it("renders with correct plan name", () => {
    render(<UpgradeCta feature="Autopilot" requiredPlan="PROFESSIONAL" currentPlan="FREE" />);
    expect(screen.getByTestId("upgrade-cta-Autopilot")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Professional")).toBeInTheDocument();
  });

  it("renders compact variant", () => {
    render(<UpgradeCta feature="Chat" requiredPlan="BASIC" currentPlan="FREE" compact />);
    expect(screen.getByText("Upgrade to Basic")).toBeInTheDocument();
    expect(screen.queryByTestId("upgrade-cta-Chat")).not.toBeInTheDocument();
  });
});
