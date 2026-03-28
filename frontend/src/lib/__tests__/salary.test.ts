import {
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
});
