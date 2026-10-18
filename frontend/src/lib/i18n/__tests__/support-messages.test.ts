import { SUPPORTED_LOCALES } from "../config";
import { SUPPORT_MESSAGES, formatSupportMessage } from "../support-messages";

describe("support messages", () => {
  const enKeys = Object.keys(SUPPORT_MESSAGES.en).sort();

  it.each(SUPPORTED_LOCALES.map((l) => [l]))("%s has every key, non-empty, with the same placeholders", (locale) => {
    const dict = SUPPORT_MESSAGES[locale];
    expect(Object.keys(dict).sort()).toEqual(enKeys);
    for (const key of enKeys) {
      const value = dict[key as keyof typeof dict];
      expect(value.trim()).not.toBe("");
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(value)).toEqual(placeholders(SUPPORT_MESSAGES.en[key as keyof typeof dict]));
    }
  });

  it("translates (non-English locales differ from English for user-facing copy)", () => {
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
      expect(SUPPORT_MESSAGES[locale]["contact.title"]).not.toBe(SUPPORT_MESSAGES.en["contact.title"]);
      expect(SUPPORT_MESSAGES[locale]["contact.submit"]).not.toBe(SUPPORT_MESSAGES.en["contact.submit"]);
    }
  });

  it("interpolates variables and leaves unknown ones intact", () => {
    expect(formatSupportMessage("Hi {name}, ref {reference}", { name: "Ada" })).toBe("Hi Ada, ref {reference}");
  });
});
