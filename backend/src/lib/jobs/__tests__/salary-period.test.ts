import { describe, expect, it } from "vitest";
import { parseSalaryPeriod, resolveSalaryPeriod } from "../salary-period.js";

describe("parseSalaryPeriod", () => {
  it("maps aliases to the enum and rejects unknown values", () => {
    expect(parseSalaryPeriod("hourly")).toBe("HOURLY");
    expect(parseSalaryPeriod(" Month ")).toBe("MONTHLY");
    expect(parseSalaryPeriod("annual")).toBe("YEARLY");
    expect(parseSalaryPeriod("daily")).toBe("DAILY");
    expect(parseSalaryPeriod("fortnight")).toBeNull();
    expect(parseSalaryPeriod(undefined)).toBeNull();
  });
});

describe("resolveSalaryPeriod", () => {
  it("keeps a declared period when the amount is plausible", () => {
    expect(resolveSalaryPeriod({ min: 60000, max: 90000, period: "yearly" })).toBe("YEARLY");
    expect(resolveSalaryPeriod({ min: 2000, max: 3000, period: "monthly" })).toBe("MONTHLY");
    expect(resolveSalaryPeriod({ min: 40, max: 80, period: "hourly" })).toBe("HOURLY");
    expect(resolveSalaryPeriod({ min: 400, max: 600, period: "daily" })).toBe("DAILY");
  });

  it("never stores a sub-1000 amount as yearly", () => {
    expect(resolveSalaryPeriod({ min: 60, max: 120, period: "yearly" })).toBe("HOURLY");
    expect(resolveSalaryPeriod({ min: 60, max: 120 })).toBe("HOURLY");
    expect(resolveSalaryPeriod({ min: 500, max: 800, period: "yearly" })).toBeNull();
    expect(resolveSalaryPeriod({ max: 950 })).toBeNull();
  });

  it("returns null when there is no amount or no declared period for a large amount", () => {
    expect(resolveSalaryPeriod({ period: "yearly" })).toBeNull();
    expect(resolveSalaryPeriod({ min: 50000 })).toBeNull();
  });
});
