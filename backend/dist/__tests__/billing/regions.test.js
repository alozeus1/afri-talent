import { describe, it, expect } from "vitest";
import { countryToRegion, isValidCountryCode, AFRICA_COUNTRIES, EUROPE_COUNTRIES } from "../../lib/billing/regions.js";
describe("countryToRegion", () => {
    it("maps Nigerian country code to AFRICA", () => {
        expect(countryToRegion("NG")).toBe("AFRICA");
    });
    it("maps Kenya to AFRICA", () => {
        expect(countryToRegion("KE")).toBe("AFRICA");
    });
    it("maps South Africa to AFRICA", () => {
        expect(countryToRegion("ZA")).toBe("AFRICA");
    });
    it("maps Ghana to AFRICA (case-insensitive)", () => {
        expect(countryToRegion("gh")).toBe("AFRICA");
    });
    it("maps Germany to EUROPE", () => {
        expect(countryToRegion("DE")).toBe("EUROPE");
    });
    it("maps UK to EUROPE", () => {
        expect(countryToRegion("GB")).toBe("EUROPE");
    });
    it("maps France to EUROPE", () => {
        expect(countryToRegion("FR")).toBe("EUROPE");
    });
    it("maps Switzerland to EUROPE", () => {
        expect(countryToRegion("CH")).toBe("EUROPE");
    });
    it("maps USA to ROW", () => {
        expect(countryToRegion("US")).toBe("ROW");
    });
    it("maps Canada to ROW", () => {
        expect(countryToRegion("CA")).toBe("ROW");
    });
    it("maps Japan to ROW", () => {
        expect(countryToRegion("JP")).toBe("ROW");
    });
    it("maps India to ROW", () => {
        expect(countryToRegion("IN")).toBe("ROW");
    });
    it("handles null input", () => {
        expect(countryToRegion(null)).toBe("ROW");
    });
    it("handles undefined input", () => {
        expect(countryToRegion(undefined)).toBe("ROW");
    });
    it("handles empty string", () => {
        expect(countryToRegion("")).toBe("ROW");
    });
    it("handles whitespace-padded input", () => {
        expect(countryToRegion(" NG ")).toBe("AFRICA");
    });
});
describe("isValidCountryCode", () => {
    it("accepts valid 2-letter codes", () => {
        expect(isValidCountryCode("NG")).toBe(true);
        expect(isValidCountryCode("US")).toBe(true);
        expect(isValidCountryCode("DE")).toBe(true);
    });
    it("rejects single-letter codes", () => {
        expect(isValidCountryCode("A")).toBe(false);
    });
});
describe("country sets are disjoint", () => {
    it("AFRICA and EUROPE have no overlap", () => {
        const overlap = [...AFRICA_COUNTRIES].filter((c) => EUROPE_COUNTRIES.has(c));
        expect(overlap).toEqual([]);
    });
});
//# sourceMappingURL=regions.test.js.map