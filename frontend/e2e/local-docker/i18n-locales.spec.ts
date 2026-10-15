/**
 * Locale coverage against the local Docker stack: switching language from the
 * header switcher, RTL for Arabic, and no untranslated English left on key
 * pages in es / fr / pt / ar (public, candidate incl. resume builder and AI
 * tools, employer and admin incl. jobs, reviews, audit logs and users).
 *
 *   APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
 *     npx playwright test -c playwright.local-docker.config.ts i18n-locales
 *
 * "Untranslated" = a visible text node, placeholder or aria-label on the
 * localised page that is identical to one on the English page and reads as
 * English prose (2+ words). User/DB content (job titles, company names, people)
 * and brand names are excluded: pages mark it with [data-user-content]. Table
 * bodies are scanned too, so status/role badges and other chrome cells count.
 * Count strings are also checked for plural agreement ("1 applications").
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

const LOCALES = ["es", "fr", "pt", "ar"] as const;
const PUBLIC_PAGES = ["", "/jobs", "/pricing", "/login", "/register", "/contact", "/companies", "/salaries", "/interviews", "/trust"];
const CANDIDATE_PAGES = [
  "/candidate",
  "/candidate/applications",
  "/candidate/profile",
  "/candidate/settings",
  "/candidate/resume-builder",
  // AI tools
  "/candidate/ai-assistant",
  "/candidate/cover-letter",
  "/candidate/interview-prep",
  "/candidate/job-matches",
  "/candidate/salary",
  "/candidate/career-gap",
  "/candidate/career-advisor",
  "/candidate/chat",
];
const EMPLOYER_PAGES = ["/employer", "/employer/jobs/new"];
const ADMIN_PAGES = ["/admin", "/admin/users", "/admin/jobs", "/admin/reviews", "/admin/audit-logs", "/admin/support", "/admin/ops"];
const SEEDED_PASSWORD = "Password123!";

// Proper nouns and product names that stay the same in every language.
const ALLOWED = [
  /AfriTalent/i,
  /Maralito Labs/i,
  /^Powered by Maralito Labs StudioTM$/,
  /LinkedIn|GitHub|Google|WhatsApp|Telegram|Stripe|Greenhouse|Lever|Ashby|Workable|Recruitee|SmartRecruiters/,
  /@example\.com|@afri-talent\.com/,
  /^We Work Remotely$/, // job source brand
  /U\.S\. Bureau of Labor Statistics/, // cited dataset name
  // Same word in the target language (fr "visa"; "Lead / Staff" is the industry level name in fr/pt).
  /^Europe \+ visa$/,
  /^Lead \/ Staff$/,
];

// Data the seeded accounts typed themselves (prisma/seed.ts): names, target
// roles and countries. User content is shown as entered, in any locale.
const USER_CONTENT = new Set([
  "Admin User",
  "Candidate One",
  "Employer Owner",
  "Full-Stack Engineer",
  "Backend Engineer",
  "United Kingdom",
]);

type Role = "public" | "candidate" | "employer" | "admin";
const states: Partial<Record<Role, string>> = {};

async function signInState(browser: Browser, email: string, home: RegExp, file: string, password = SEEDED_PASSWORD) { // secret-scan:allow (seeded local-only test password constant)
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en/login");
  await page.waitForTimeout(3500); // bot shield rejects instant submissions
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(home, { timeout: 60_000 });
  await context.storageState({ path: file });
  await context.close();
  return file;
}

/** Visible UI strings, skipping user-generated/DB content regions. */
async function uiStrings(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const SKIP =
      'a[href*="/jobs/"], a[href*="/companies/"], article, [data-i18n-ignore], [data-user-content], script, style, noscript, code, pre, [aria-hidden="true"], input, textarea, select, option, time';
    const out = new Set<string>();
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!el || !text || el.closest(SKIP) || !visible(el)) continue;
      out.add(text);
    }
    for (const el of Array.from(document.querySelectorAll("[placeholder], [aria-label]"))) {
      if (el.closest('[data-i18n-ignore], [data-user-content], a[href*="/jobs/"], a[href*="/companies/"], article') || !visible(el)) continue;
      for (const attr of ["placeholder", "aria-label"]) {
        const v = el.getAttribute(attr)?.replace(/\s+/g, " ").trim();
        if (v) out.add(v);
      }
    }
    return [...out];
  });
}

/** "1 applications", "1 jobs found": a singular count followed by a plural noun. */
const badPlural = (s: string) => /(^|[^\d.,])1 [A-Za-z]+s\b/.test(s) && !/\b1 (of|plus|is|was|has)\b/.test(s);

const looksLikeEnglishProse = (s: string) =>
  /[a-z]{2,}/i.test(s) && s.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'’-]+$/.test(w)).length >= 2;

async function untranslated(browser: Browser, role: Role, path: string, locale: string) {
  const ctx = await browser.newContext({ storageState: states[role] });
  const page = await ctx.newPage();
  await page.goto(`/en${path}`);
  const en = new Set(await uiStrings(page));
  await page.goto(`/${locale}${path}`);
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}`));
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  const loc = await uiStrings(page);
  // Anything identical to the English page that reads as prose is a miss.
  const leftovers = loc.filter(
    (s) => en.has(s) && looksLikeEnglishProse(s) && !USER_CONTENT.has(s) && !ALLOWED.some((re) => re.test(s)),
  );
  await ctx.close();
  return [...leftovers, ...[...en].filter(badPlural).map((s) => `en plural: ${s}`)];
}

test.beforeAll(async ({ browser }, testInfo) => {
  states.candidate = await signInState(browser, "candidate@example.com", /\/en\/candidate/, testInfo.outputPath("candidate.json"));
  states.employer = await signInState(browser, "employer@example.com", /\/en\/employer/, testInfo.outputPath("employer.json"));
  states.admin = await signInState(browser, "admin@example.com", /\/admin(\/|$)/, testInfo.outputPath("admin.json"));
});

test("header language switcher changes locale, and Arabic is RTL", async ({ page }) => {
  await page.goto("/en/jobs");
  await expect(page.locator("html")).toHaveAttribute("lang", /^en/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  for (const locale of ["es", "fr", "pt", "ar"] as const) {
    await page.getByRole("combobox", { name: /language|langue|idioma|اللغة/i }).first().selectOption(locale);
    await page.waitForURL(new RegExp(`/${locale}/jobs`));
    await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}`));
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  }
  await page.getByRole("combobox", { name: /language|langue|idioma|اللغة/i }).first().selectOption("en");
  await page.waitForURL(/\/en\/jobs/);
});

for (const [role, pages] of [
  ["public", PUBLIC_PAGES],
  ["candidate", CANDIDATE_PAGES],
  ["employer", EMPLOYER_PAGES],
  ["admin", ADMIN_PAGES],
] as const) {
  for (const path of pages) {
    for (const locale of LOCALES) {
      test(`${role} ${path || "/"} has no English left in ${locale}`, async ({ browser }) => {
        const leftovers = await untranslated(browser, role, path, locale);
        expect(leftovers, `untranslated strings on /${locale}${path}`).toEqual([]);
      });
    }
  }
}
