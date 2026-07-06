import { describe, it, expect } from "vitest";
import { normalizeCardCountry } from "../../routes/webhooks.js";

// Regression: Flutterwave returns card.country as "NIGERIA NG" (name + ISO code),
// but UserBillingProfile.country/stripeCountry are VARCHAR(2). Writing the raw
// value overflowed the column, threw in the webhook, and left a paid customer
// un-activated. normalizeCardCountry must reduce it to the 2-letter ISO code.

describe("normalizeCardCountry", () => {
  it("extracts the ISO alpha-2 code from Flutterwave's 'NAME CODE' format", () => {
    expect(normalizeCardCountry("NIGERIA NG")).toBe("NG");
    expect(normalizeCardCountry("UNITED STATES US")).toBe("US");
    expect(normalizeCardCountry("SOUTH AFRICA ZA")).toBe("ZA");
  });

  it("passes through a bare 2-letter code (any case)", () => {
    expect(normalizeCardCountry("NG")).toBe("NG");
    expect(normalizeCardCountry("ng")).toBe("NG");
    expect(normalizeCardCountry(" gb ")).toBe("GB");
  });

  it("returns null when there is no usable 2-letter code", () => {
    expect(normalizeCardCountry("NIGERIA")).toBeNull();
    expect(normalizeCardCountry("USA")).toBeNull();
    expect(normalizeCardCountry("")).toBeNull();
    expect(normalizeCardCountry(null)).toBeNull();
    expect(normalizeCardCountry(undefined)).toBeNull();
    expect(normalizeCardCountry(123)).toBeNull();
  });

  it("never returns a value longer than 2 chars (the column limit)", () => {
    for (const input of ["NIGERIA NG", "NG", "UNITED KINGDOM GB", "x".repeat(50)]) {
      const out = normalizeCardCountry(input);
      expect(out === null || out.length === 2).toBe(true);
    }
  });
});
