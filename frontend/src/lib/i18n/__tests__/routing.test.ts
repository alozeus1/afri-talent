import {
  detectPreferredLocaleFromHeader,
  getLocaleFromPath,
  localizePath,
  stripLocaleFromPath,
} from "../client";

describe("i18n route helpers", () => {
  it("extracts locale from pathname", () => {
    expect(getLocaleFromPath("/es/jobs")).toBe("es");
    expect(getLocaleFromPath("/fr/jobs")).toBe("fr");
    expect(getLocaleFromPath("/pt/pricing")).toBe("pt");
    expect(getLocaleFromPath("/")).toBe("en");
  });

  it("strips locale prefix from localized paths", () => {
    expect(stripLocaleFromPath("/ar/candidate")).toBe("/candidate");
    expect(stripLocaleFromPath("/en")).toBe("/");
    expect(stripLocaleFromPath("/jobs")).toBe("/jobs");
  });

  it("localizes paths without duplicating locale segments", () => {
    expect(localizePath("/jobs", "es")).toBe("/es/jobs");
    expect(localizePath("/jobs", "pt")).toBe("/pt/jobs");
    expect(localizePath("/fr/pricing", "ar")).toBe("/ar/pricing");
    expect(localizePath("/", "fr")).toBe("/fr");
  });

  it("detects preferred locale from accept-language header", () => {
    expect(detectPreferredLocaleFromHeader("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
    expect(detectPreferredLocaleFromHeader("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(detectPreferredLocaleFromHeader("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(detectPreferredLocaleFromHeader("ar-SA,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(detectPreferredLocaleFromHeader("de-DE,de;q=0.9")).toBe("en");
    expect(detectPreferredLocaleFromHeader(null)).toBe("en");
  });
});
