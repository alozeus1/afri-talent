import { renderHook } from "@testing-library/react";
import { EMPLOYER_MESSAGES, translateEmployer, useEmployerI18n } from "../employer-messages";
import type { SupportedLocale } from "../config";

let mockLocale: SupportedLocale = "fr";
jest.mock("../client", () => ({
  useLocale: () => mockLocale,
}));

describe("employer i18n", () => {
  it("merges every employer namespace for each locale", () => {
    const enKeys = Object.keys(EMPLOYER_MESSAGES.en).sort();
    for (const locale of ["fr", "es", "pt", "ar"] as const) {
      expect(Object.keys(EMPLOYER_MESSAGES[locale]).sort()).toEqual(enKeys);
    }
    expect(enKeys.length).toBeGreaterThan(500);
  });

  it("interpolates variables", () => {
    expect(translateEmployer("en", "checklist.complete", { pct: 40 })).toBe("40% complete");
    expect(translateEmployer("fr", "dash.titleNamed", { company: "Acme" })).toContain("Acme");
  });

  it("translates known API copy and passes unknown text through", () => {
    mockLocale = "fr";
    const { result } = renderHook(() => useEmployerI18n());
    expect(result.current.ts("Complete company setup")).toBe("Compléter le profil de l'entreprise");
    expect(result.current.ts("Unverified employer")).toBe("Employeur non vérifié");
    expect(result.current.ts("Some brand new server sentence")).toBe("Some brand new server sentence");
  });

  it("picks plural forms and translates enum values with a readable fallback", () => {
    mockLocale = "ar";
    const { result } = renderHook(() => useEmployerI18n());
    expect(result.current.tn("dash.applicationCount", 3)).toContain("3");
    expect(result.current.tv("status.app", "SHORTLISTED")).toBe("في القائمة المختصرة");
    expect(result.current.tv("status.app", "SOME_NEW_STATUS")).toBe("Some New Status");
  });
});
