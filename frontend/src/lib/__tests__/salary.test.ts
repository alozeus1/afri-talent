import {
  formatSalaryParts,
  formatSalaryRange,
  normalizeSalaryPeriod,
  salaryPeriodLabel,
  salaryPeriodSchemaUnit,
} from "../salary";

describe("salary utils", () => {
  it("normalizes aliases to supported salary periods", () => {
    expect(normalizeSalaryPeriod("annual")).toBe("yearly");
    expect(normalizeSalaryPeriod("MONTH")).toBe("monthly");
    expect(normalizeSalaryPeriod("weekly")).toBe("weekly");
    expect(normalizeSalaryPeriod("hour")).toBe("hourly");
    expect(normalizeSalaryPeriod("unknown")).toBe("yearly");
  });

  it("formats salary ranges with period labels", () => {
    expect(
      formatSalaryRange({
        salaryMin: 1200,
        salaryMax: 1500,
        currency: "USD",
        salaryPeriod: "monthly",
      }),
    ).toBe("USD 1,200 - USD 1,500/month");

    expect(
      formatSalaryRange({
        salaryMin: 80000,
        currency: "EUR",
        salaryPeriod: "year",
      }),
    ).toBe("EUR 80,000/year");
  });

  it("returns null when no salary bounds are available", () => {
    expect(formatSalaryRange({ salaryPeriod: "monthly" })).toBeNull();
  });

  it("maps periods to schema units", () => {
    expect(salaryPeriodLabel("hourly")).toBe("hour");
    expect(salaryPeriodSchemaUnit("hourly")).toBe("HOUR");
    expect(salaryPeriodSchemaUnit("monthly")).toBe("MONTH");
  });

  it("never labels a sub-1000 amount as yearly", () => {
    expect(formatSalaryRange({ salaryMin: 60, salaryMax: 120, currency: "USD" })).toBe("USD 60 - USD 120");
    expect(formatSalaryRange({ salaryMin: 60, salaryMax: 120, currency: "USD", salaryPeriod: "YEARLY" })).toBe(
      "USD 60 - USD 120",
    );
    expect(formatSalaryRange({ salaryMin: 60, salaryMax: 120, currency: "USD", salaryPeriod: "HOURLY" })).toBe(
      "USD 60 - USD 120/hour",
    );
    expect(formatSalaryParts({ salaryMax: 950, salaryPeriod: "DAILY" })).toEqual({ amount: "USD 950", period: "daily" });
  });

  it("accepts the backend enum casing", () => {
    expect(formatSalaryRange({ salaryMin: 2000, salaryPeriod: "MONTHLY" })).toBe("USD 2,000/month");
    expect(formatSalaryRange({ salaryMin: 60000, salaryMax: 90000 })).toBe("USD 60,000 - USD 90,000/year");
  });
});
