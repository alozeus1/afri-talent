/**
 * Layout guard: no horizontal page scroll and single-line header labels on
 * public, candidate, employer and admin pages in en / fr / pt / ar at desktop
 * (1440, 1280) and phone (390) widths.
 *
 *   APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
 *     npx playwright test -c playwright.local-docker.config.ts layout-overflow
 *
 * Signs in as the seeded demo accounts (backend/prisma/seed.ts).
 */
import { test, expect, type Browser, type Page } from "@playwright/test";

const LOCALES = ["en", "fr", "pt", "ar"] as const;
const WIDTHS = [1440, 1280, 390] as const;
const SEEDED_PASSWORD = "Password123!";

const ROLES = [
  { role: "public", email: null, home: null, pages: ["", "/jobs", "/companies", "/pricing"] },
  { role: "candidate", email: "candidate@example.com", home: /\/en\/candidate/, pages: ["/candidate", "/candidate/applications"] },
  { role: "employer", email: "employer@example.com", home: /\/en\/employer/, pages: ["/employer", "/employer/jobs/new"] },
  { role: "admin", email: "admin@example.com", home: /\/admin(\/|$)/, pages: ["/admin", "/admin/users", "/admin/jobs"] },
] as const;

const states: Partial<Record<(typeof ROLES)[number]["role"], string>> = {};

async function signIn(browser: Browser, email: string, home: RegExp, file: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en/login");
  await page.waitForTimeout(3500); // bot shield rejects instant submissions
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(home, { timeout: 60_000 });
  await context.storageState({ path: file });
  await context.close();
  return file;
}

/** Returns a list of layout problems on the current page (empty = OK). */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(`page scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}`);
    }
    // Header labels must stay on one line: every text node inside a header
    // link or button has to lay out as a single line box. Hidden nodes have
    // no client rects and are skipped.
    const header = document.querySelector("header") ?? document.querySelector(".admin-console > div");
    if (header) {
      const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? "").trim();
        if (!text || !node.parentElement?.closest("a, button")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = Array.from(range.getClientRects())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => r.top)
          .sort((x, y) => x - y);
        const lineCount = tops.filter((top, i) => i === 0 || top - tops[i - 1] > 2).length;
        if (lineCount > 1) problems.push(`header label wraps onto ${lineCount} lines: "${text}"`);
      }
    }
    return problems;
  });
}

test.beforeAll(async ({ browser }, testInfo) => {
  for (const { role, email, home } of ROLES) {
    if (email && home) states[role] = await signIn(browser, email, home, testInfo.outputPath(`${role}-state.json`));
  }
});

for (const { role, pages } of ROLES) {
  for (const locale of LOCALES) {
    test(`${role} ${locale}: no horizontal overflow at ${WIDTHS.join("/")}px`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: states[role], viewport: { width: WIDTHS[0], height: 900 } });
      const page = await context.newPage();
      const failures: string[] = [];
      for (const path of pages) {
        await page.goto(`/${locale}${path}`);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await expect(page.locator("main")).toBeVisible();
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(250);
          for (const problem of await layoutProblems(page)) failures.push(`/${locale}${path} @${width}: ${problem}`);
        }
        await page.setViewportSize({ width: WIDTHS[0], height: 900 });
      }
      expect(failures).toEqual([]);
      await context.close();
    });
  }
}

test("admin console uses its own shell (no marketing header or footer)", async ({ browser }) => {
  const context = await browser.newContext({ storageState: states.admin, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/fr/admin");
  const search = page.locator("#admin-global-search");
  await expect(search).toBeVisible();
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  await search.fill("employer");
  await search.press("Enter");
  await page.waitForURL(/\/fr\/admin\/users\?search=employer/);
  await context.close();
});
