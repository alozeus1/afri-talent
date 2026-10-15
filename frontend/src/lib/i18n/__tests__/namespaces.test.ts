import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../config";
import { MESSAGES } from "../messages";
import { ALL_NAMESPACES, SITE_NAMESPACES } from "../messages/registry";
import { readLocaleCookie, resolveLocale } from "../client";
import { argumentSignature } from "../format";

const placeholders = (s: string) => argumentSignature(s);

describe("i18n namespaces", () => {
  it("registers every namespace directory", () => {
    const dir = path.join(__dirname, "..", "messages");
    const onDisk = readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory()).sort();
    expect(Object.keys(ALL_NAMESPACES).sort()).toEqual(onDisk);
  });

  describe.each(Object.entries(ALL_NAMESPACES))("%s", (_name, ns) => {
    const enKeys = Object.keys(ns.en).sort();

    it.each(SUPPORTED_LOCALES.filter((l) => l !== "en").map((l) => [l]))(
      "%s defines every en key, non-empty, with the same placeholders",
      (locale) => {
        const dict = ns[locale];
        expect(Object.keys(dict).sort()).toEqual(enKeys);
        for (const key of enKeys) {
          expect(dict[key].trim()).not.toBe("");
          expect(placeholders(dict[key])).toEqual(placeholders(ns.en[key]));
        }
      },
    );
  });

  it("keeps site namespace keys unique so MESSAGES merges losslessly", () => {
    const seen = new Set<string>();
    for (const ns of Object.values(SITE_NAMESPACES)) {
      for (const key of Object.keys(ns.en)) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(Object.keys(MESSAGES.en)).toHaveLength(seen.size);
  });

  it("aggregates existing keys into MESSAGES for every locale", () => {
    expect(MESSAGES.en["nav.findJobs"]).toBe("Find Jobs");
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    }
    expect(MESSAGES.fr["nav.findJobs"]).not.toBe(MESSAGES.en["nav.findJobs"]);
  });
});

describe("locale resolution for non-[locale] routes", () => {
  it("reads the locale cookie", () => {
    expect(readLocaleCookie("a=1; afritalent-locale=fr; b=2")).toBe("fr");
    expect(readLocaleCookie("afritalent-locale=xx")).toBeNull();
    expect(readLocaleCookie("")).toBeNull();
  });

  it("prefers the path prefix, then the cookie, then the default", () => {
    expect(resolveLocale("/pt/jobs", "fr")).toBe("pt");
    expect(resolveLocale("/employer/dashboard", "ar")).toBe("ar");
    expect(resolveLocale("/admin", null)).toBe("en");
  });
});
