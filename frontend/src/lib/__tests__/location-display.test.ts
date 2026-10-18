import { tidyLocation } from "../location-display";
import { translateLocation } from "../i18n/public-labels";
import { translatePublic, type PublicMessageKey, type PublicVars } from "../i18n/public-messages";
import type { SupportedLocale } from "../i18n/config";

const LONG_LIST =
  "United Kingdom / Brazil / United Arab Emirates / Ireland / Peru / Sweden / Colombia / Argentina / Romania / Cyprus / Switzerland / Portugal / Lithuania / South Africa / Czech Republic / Canada / Hungary / Mexico / Chile / Poland / Spain";

describe("tidyLocation", () => {
  it("collapses a duplicated city/region", () => {
    expect(tidyLocation("Paris, Paris")).toEqual({ kind: "text", text: "Paris" });
    expect(tidyLocation("Lagos, Lagos, Nigeria")).toEqual({ kind: "text", text: "Lagos, Nigeria" });
  });

  it("strips office labels and ATS board prefixes", () => {
    expect(tidyLocation("Berlin Office")).toEqual({ kind: "text", text: "Berlin" });
    expect(tidyLocation("EMEA; Roles - EMEA")).toEqual({ kind: "text", text: "EMEA" });
    expect(tidyLocation("Roles - EMEA; Sliema, Malta")).toEqual({ kind: "text", text: "EMEA, Sliema, Malta" });
  });

  it("maps timezone-only strings to a timezone window", () => {
    expect(tidyLocation("Time zone: CET +/- 3 hours")).toEqual({ kind: "timezone", zone: "CET ±3h" });
    expect(tidyLocation("CET +/- 3 hours")).toEqual({ kind: "timezone", zone: "CET ±3h" });
    expect(tidyLocation("UTC+1 to UTC+3")).toEqual({ kind: "timezone", zone: "UTC+1 to UTC+3" });
  });

  it("collapses long country lists on cards, African place first", () => {
    expect(tidyLocation(LONG_LIST, { compact: true })).toEqual({ kind: "list", first: "South Africa", more: 20 });
    expect(tidyLocation("EMEA / Romania / Bulgaria / Portugal / Canada", { compact: true })).toEqual({
      kind: "list",
      first: "EMEA",
      more: 4,
    });
  });

  it("keeps short lists and non-compact lists intact", () => {
    expect(tidyLocation("EMEA / Toronto", { compact: true })).toEqual({ kind: "text", text: "EMEA / Toronto" });
    expect(tidyLocation(LONG_LIST)).toEqual({ kind: "text", text: LONG_LIST });
    expect(tidyLocation("Cape Town, South Africa", { compact: true })).toEqual({ kind: "text", text: "Cape Town, South Africa" });
  });

  it("leaves ordinary locations alone", () => {
    expect(tidyLocation("Remote")).toEqual({ kind: "text", text: "Remote" });
    expect(tidyLocation("  ")).toEqual({ kind: "text", text: "" });
  });
});

describe("translateLocation", () => {
  const tpFor = (locale: SupportedLocale) => (key: PublicMessageKey, vars?: PublicVars) => translatePublic(locale, key, vars);

  it("renders tidy forms in English", () => {
    const tp = tpFor("en");
    expect(translateLocation(tp, "en", "Time zone: CET +/- 3 hours")).toBe("Remote (CET ±3h)");
    expect(translateLocation(tp, "en", LONG_LIST, { compact: true })).toBe("South Africa + 20 more");
    expect(translateLocation(tp, "en", "Paris, Paris")).toBe("Paris");
  });

  it("localises the tidy forms", () => {
    expect(translateLocation(tpFor("fr"), "fr", "CET +/- 3 hours")).toBe("À distance (CET ±3h)");
    expect(translateLocation(tpFor("fr"), "fr", "Anywhere in the World")).toBe(
      translatePublic("fr", "discover.loc.worldwide"),
    );
    expect(translateLocation(tpFor("fr"), "fr", LONG_LIST, { compact: true })).toBe("Afrique du Sud + 20 autres");
    expect(translateLocation(tpFor("ar"), "ar", LONG_LIST, { compact: true })).toContain("+");
  });
});
