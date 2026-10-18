import { render, screen } from "@testing-library/react";
import { SalaryText } from "../salary-text";

let mockLocale = "en";
jest.mock("@/lib/i18n/client", () => ({
  useLocale: () => mockLocale,
  localizePath: (path: string, locale: string) => `/${locale}${path}`,
}));

describe("SalaryText", () => {
  beforeEach(() => {
    mockLocale = "en";
  });

  it("labels an hourly rate per hour, not per year", () => {
    const { container } = render(
      <SalaryText salary={{ salaryMin: 60, salaryMax: 120, currency: "USD", salaryPeriod: "HOURLY" }} />,
    );
    expect(container.textContent).toBe("USD 60 - USD 120/hour");
  });

  it("drops the period for a sub-1000 amount with an unknown or yearly period", () => {
    const { container, rerender } = render(<SalaryText salary={{ salaryMin: 60, salaryMax: 120, currency: "USD" }} />);
    expect(container.textContent).toBe("USD 60 - USD 120");
    rerender(<SalaryText salary={{ salaryMin: 60, salaryMax: 120, currency: "USD", salaryPeriod: "YEARLY" }} />);
    expect(container.textContent).toBe("USD 60 - USD 120");
  });

  it("isolates the LTR amount inside the Arabic period label", () => {
    mockLocale = "ar";
    const { container } = render(
      <SalaryText salary={{ salaryMin: 60000, salaryMax: 90000, currency: "USD", salaryPeriod: "YEARLY" }} />,
    );
    const amount = screen.getByTestId("salary-amount");
    expect(amount.tagName).toBe("BDI");
    expect(amount).toHaveAttribute("dir", "ltr");
    expect(amount.textContent).toBe("USD 60,000 - USD 90,000");
    expect(container.textContent).toBe("USD 60,000 - USD 90,000/سنويًا");
  });

  it("renders nothing without a salary", () => {
    const { container } = render(<SalaryText salary={{ currency: "USD" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
