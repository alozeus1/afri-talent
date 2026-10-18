import { argumentSignature, formatMessage, pluralProblems, requiredPluralCategories } from "../format";
import { ALL_NAMESPACES } from "../messages/registry";
import { SUPPORTED_LOCALES } from "../config";
import { ADMIN_MESSAGES, formatAdminMessage, type AdminMessageKey } from "../admin-messages";
import type { SupportedLocale } from "../config";
import arDiscover from "../messages/discover/ar";

const translateAdmin = (locale: SupportedLocale, key: AdminMessageKey, vars: Record<string, number>) =>
  formatAdminMessage(ADMIN_MESSAGES[locale][key], vars, locale);

const AR_JOBS =
  "{count, plural, zero {لا وظائف} one {وظيفة واحدة} two {وظيفتان} few {# وظائف} many {# وظيفة} other {# وظيفة}}";

describe("formatMessage", () => {
  it("interpolates simple arguments and keeps unknown ones visible", () => {
    expect(formatMessage("Hi {name}, ref {reference}", { name: "Ada" })).toBe("Hi Ada, ref {reference}");
    expect(formatMessage("No vars {x}")).toBe("No vars {x}");
  });

  it("selects English one/other forms", () => {
    const tpl = "{count, plural, one {# application} other {# applications}}";
    expect(formatMessage(tpl, { count: 1 }, "en")).toBe("1 application");
    expect(formatMessage(tpl, { count: 0 }, "en")).toBe("0 applications");
    expect(formatMessage(tpl, { count: 1234 }, "en")).toBe("1,234 applications");
  });

  it("treats 0 and 1 as singular in French and Portuguese", () => {
    const fr = "{count, plural, one {# candidature} other {# candidatures}}";
    expect(formatMessage(fr, { count: 0 }, "fr")).toBe("0 candidature");
    expect(formatMessage(fr, { count: 2 }, "fr")).toBe("2 candidatures");
    const pt = "{count, plural, one {# vaga} other {# vagas}}";
    expect(formatMessage(pt, { count: 1 }, "pt")).toBe("1 vaga");
    expect(formatMessage(pt, { count: 5 }, "pt")).toBe("5 vagas");
  });

  it("uses all six Arabic plural forms", () => {
    const n = (count: number) => formatMessage(AR_JOBS, { count }, "ar");
    expect(n(0)).toBe("لا وظائف");
    expect(n(1)).toBe("وظيفة واحدة");
    expect(n(2)).toBe("وظيفتان");
    expect(n(3)).toMatch(/وظائف$/);
    expect(n(11)).toMatch(/وظيفة$/);
    expect(n(100)).toMatch(/وظيفة$/);
  });

  it("prefers exact =N branches and supports select and nesting", () => {
    const tpl = "{count, plural, =0 {No jobs} one {# job for {name}} other {# jobs for {name}}}";
    expect(formatMessage(tpl, { count: 0, name: "Ada" })).toBe("No jobs");
    expect(formatMessage(tpl, { count: 1, name: "Ada" })).toBe("1 job for Ada");
    const sel = "{kind, select, remote {Remote} other {On site}}";
    expect(formatMessage(sel, { kind: "remote" })).toBe("Remote");
    expect(formatMessage(sel, { kind: "x" })).toBe("On site");
  });

  it("accepts pre-formatted counts", () => {
    const tpl = "{count, plural, one {# job} other {# jobs}}";
    expect(formatMessage(tpl, { count: "1,234" }, "en")).toBe("1,234 jobs");
    expect(formatMessage(tpl, { count: "1" }, "en")).toBe("1 job");
    expect(formatMessage(AR_JOBS, { count: "٢" }, "ar")).toBe("وظيفتان");
  });

  it("formats a real admin count string per locale (no more '1 applications')", () => {
    expect(translateAdmin("en", "users.applicationsCount", { count: 1 })).toBe("1 application");
    expect(translateAdmin("en", "users.applicationsCount", { count: 3 })).toBe("3 applications");
    expect(translateAdmin("ar", "users.applicationsCount", { count: 2 })).toBe("طلبان");
  });
});

describe("plural parity", () => {
  it("knows each locale's required categories", () => {
    expect(requiredPluralCategories("en")).toEqual(["one", "other"]);
    expect(requiredPluralCategories("ar")).toEqual(["few", "many", "one", "other", "two", "zero"]);
  });

  it("every plural message lists its locale's categories and keeps en's arguments", () => {
    for (const [name, ns] of Object.entries(ALL_NAMESPACES)) {
      for (const locale of SUPPORTED_LOCALES) {
        for (const [key, value] of Object.entries(ns[locale])) {
          expect([`${name}/${locale}/${key}`, pluralProblems(value, locale)]).toEqual([`${name}/${locale}/${key}`, []]);
          expect([`${name}/${locale}/${key}`, argumentSignature(value)]).toEqual([
            `${name}/${locale}/${key}`,
            argumentSignature(ns.en[key]),
          ]);
        }
      }
    }
  });
});

describe("Arabic posted-age labels", () => {
  it("uses full plural forms instead of a truncated unit", () => {
    const ar = arDiscover as Record<string, string>;
    expect(formatMessage(ar["discover.posted.daysShort"], { count: "3" }, "ar")).toBe("نُشرت قبل 3 أيام");
    expect(formatMessage(ar["discover.posted.daysShort"], { count: "2" }, "ar")).toBe("نُشرت قبل يومين");
    expect(formatMessage(ar["discover.posted.weeksShort"], { count: "3" }, "ar")).toBe("نُشرت قبل 3 أسابيع");
    expect(formatMessage(ar["discover.posted.monthsShort"], { count: "11" }, "ar")).toBe("نُشرت قبل 11 شهرًا");
  });
});
