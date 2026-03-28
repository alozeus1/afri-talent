import { render, screen, fireEvent } from "@testing-library/react";
import { PlanCard, FeatureItem } from "../plan-card";

const baseFeatures: FeatureItem[] = [
  { label: "Browse all jobs", included: "yes" },
  { label: "Applications", included: "limited", limit: "5/month" },
  { label: "AI auto-apply", included: "no" },
];

const baseProps = {
  planKey: "FREE",
  name: "Free",
  description: "Start your search",
  features: baseFeatures,
  interval: "MONTHLY" as const,
  isCurrent: false,
  isPopular: false,
  isLoggedIn: false,
  onCheckout: jest.fn(),
  checkoutLoading: null,
};

describe("PlanCard", () => {
  it("renders plan name and description", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Start your search")).toBeInTheDocument();
  });

  it("renders $0 for free plans", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("forever")).toBeInTheDocument();
  });

  it("renders display amount from priceInfo for paid plans", () => {
    render(
      <PlanCard
        {...baseProps}
        planKey="BASIC"
        name="Basic"
        priceInfo={{
          plan: "BASIC",
          region: "AFRICA",
          interval: "MONTHLY",
          currency: "USD",
          amount: 399,
          stripePriceId: null,
          displayAmount: "$3.99",
        }}
      />,
    );
    expect(screen.getByText("$3.99")).toBeInTheDocument();
    expect(screen.getByText("/mo")).toBeInTheDocument();
  });

  it("shows /yr for yearly interval on paid plans", () => {
    render(
      <PlanCard
        {...baseProps}
        planKey="BASIC"
        name="Basic"
        interval="YEARLY"
        priceInfo={{
          plan: "BASIC",
          region: "EUROPE",
          interval: "YEARLY",
          currency: "EUR",
          amount: 9990,
          stripePriceId: null,
          displayAmount: "\u20AC99.90",
        }}
      />,
    );
    expect(screen.getByText("/yr")).toBeInTheDocument();
  });

  it("renders included, limited, and excluded features with correct icons", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.getByText("Browse all jobs")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("(5/month)")).toBeInTheDocument();
    expect(screen.getByText("AI auto-apply")).toBeInTheDocument();
  });

  it("shows Most Popular badge when isPopular", () => {
    render(<PlanCard {...baseProps} isPopular />);
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
  });

  it("does not show Most Popular badge when not popular", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.queryByText("Most Popular")).not.toBeInTheDocument();
  });

  it("shows 'Your Current Plan' badge when isCurrent", () => {
    render(<PlanCard {...baseProps} isCurrent isLoggedIn />);
    expect(screen.getByText("Your Current Plan")).toBeInTheDocument();
  });

  it("shows Sign Up Free button for unauthenticated users on free plan", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.getByText("Sign Up Free")).toBeInTheDocument();
  });

  it("shows Get Started button for unauthenticated users on paid plan", () => {
    render(<PlanCard {...baseProps} planKey="BASIC" name="Basic" />);
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("shows Upgrade button and calls onCheckout for logged-in user on non-current paid plan", () => {
    const onCheckout = jest.fn();
    render(
      <PlanCard
        {...baseProps}
        planKey="PROFESSIONAL"
        name="Pro"
        isLoggedIn
        onCheckout={onCheckout}
        priceInfo={{
          plan: "PROFESSIONAL",
          region: "ROW",
          interval: "MONTHLY",
          currency: "USD",
          amount: 2499,
          stripePriceId: "price_xxx",
          displayAmount: "$24.99",
        }}
      />,
    );
    const btn = screen.getByText("Upgrade");
    fireEvent.click(btn);
    expect(onCheckout).toHaveBeenCalledWith("PROFESSIONAL");
  });

  it("shows disabled 'Current Plan' button when isCurrent and logged in", () => {
    render(<PlanCard {...baseProps} isCurrent isLoggedIn />);
    const btn = screen.getByText("Current Plan");
    expect(btn).toBeDisabled();
  });

  it("shows tax label when provided for paid plans", () => {
    render(
      <PlanCard
        {...baseProps}
        planKey="BASIC"
        name="Basic"
        taxLabel="VAT"
        priceInfo={{
          plan: "BASIC",
          region: "EUROPE",
          interval: "MONTHLY",
          currency: "EUR",
          amount: 999,
          stripePriceId: null,
          displayAmount: "\u20AC9.99",
        }}
      />,
    );
    expect(screen.getByText("excl. VAT")).toBeInTheDocument();
  });

  it("has correct test id", () => {
    render(<PlanCard {...baseProps} />);
    expect(screen.getByTestId("plan-card-FREE")).toBeInTheDocument();
  });
});
