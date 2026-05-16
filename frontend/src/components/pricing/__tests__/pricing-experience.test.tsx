import { render, screen } from "@testing-library/react";
import { PricingExperience } from "../pricing-experience";
import type { PricingData, RegionalPriceInfo } from "@/lib/api";

jest.mock("@/lib/i18n/client", () => ({
  useT: () => (key: string) => key,
  useLocale: () => "en",
  localizePath: (path: string) => `/en${path}`,
}));

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/analytics", () => ({
  pricingEvents: {
    pageView: jest.fn(),
    intervalToggle: jest.fn(),
    planTabSwitch: jest.fn(),
    regionChange: jest.fn(),
    checkoutClick: jest.fn(),
  },
}));

function makePrice(
  plan: string,
  region: string,
  currency: string,
  amount: number,
  displayAmount: string,
  interval: "MONTHLY" | "YEARLY" = "MONTHLY",
): RegionalPriceInfo {
  return {
    plan,
    region,
    interval,
    currency,
    amount,
    stripePriceId: `price_${plan}_${region}_${interval}`,
    displayAmount,
  };
}

function makePricingData(
  region: string,
  currency: string,
  prices: RegionalPriceInfo[],
): PricingData {
  return {
    region,
    currency,
    availableCurrencies: [currency],
    taxBehavior: "exclusive",
    taxLabel: null,
    prices,
    entitlements: {},
  };
}

describe("PricingExperience SSR pricing", () => {
  it("renders Africa pricing for the BASIC and PROFESSIONAL plans", () => {
    const data = makePricingData("AFRICA", "NGN", [
      makePrice("BASIC", "AFRICA", "NGN", 290000, "₦2,900"),
      makePrice("PROFESSIONAL", "AFRICA", "NGN", 790000, "₦7,900"),
    ]);
    render(<PricingExperience initialPricingData={data} initialRegion="AFRICA" />);

    expect(screen.getByText("₦2,900")).toBeInTheDocument();
    expect(screen.getByText("₦7,900")).toBeInTheDocument();
    expect(screen.getByText(/Pricing shown for/)).toBeInTheDocument();
    expect(screen.getAllByText("Africa").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Europe pricing for the BASIC and PROFESSIONAL plans", () => {
    const data = makePricingData("EUROPE", "EUR", [
      makePrice("BASIC", "EUROPE", "EUR", 999, "€9.99"),
      makePrice("PROFESSIONAL", "EUROPE", "EUR", 2999, "€29.99"),
    ]);
    render(<PricingExperience initialPricingData={data} initialRegion="EUROPE" />);

    expect(screen.getByText("€9.99")).toBeInTheDocument();
    expect(screen.getByText("€29.99")).toBeInTheDocument();
    expect(screen.getByText(/Pricing shown for/)).toBeInTheDocument();
    expect(screen.getAllByText("Europe").length).toBeGreaterThanOrEqual(1);
  });

  it("renders ROW pricing for the BASIC and PROFESSIONAL plans", () => {
    const data = makePricingData("ROW", "USD", [
      makePrice("BASIC", "ROW", "USD", 1199, "$11.99"),
      makePrice("PROFESSIONAL", "ROW", "USD", 3499, "$34.99"),
    ]);
    render(<PricingExperience initialPricingData={data} initialRegion="ROW" />);

    expect(screen.getByText("$11.99")).toBeInTheDocument();
    expect(screen.getByText("$34.99")).toBeInTheDocument();
    expect(screen.getByText(/Pricing shown for/)).toBeInTheDocument();
    expect(screen.getAllByText("Rest of World").length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to ROW label when no pricing data is provided", () => {
    render(<PricingExperience initialPricingData={null} initialRegion="ROW" />);
    expect(screen.getByText(/Pricing shown for/)).toBeInTheDocument();
    expect(screen.getAllByText("Rest of World").length).toBeGreaterThanOrEqual(1);
  });
});
