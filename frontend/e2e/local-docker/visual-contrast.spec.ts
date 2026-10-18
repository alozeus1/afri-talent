/**
 * Visual contrast smoke: key pages in light AND dark mode, at desktop and
 * mobile widths, must have zero axe `color-contrast` violations. A full-page
 * screenshot of every combination is attached to the report.
 *
 *   APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
 *     npx playwright test -c playwright.local-docker.config.ts visual-contrast
 *
 * Authenticated pages use VISUAL_CANDIDATE_EMAIL / VISUAL_CANDIDATE_PASSWORD
 * when set; otherwise a throwaway candidate is registered through the UI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const PUBLIC_PAGES = [
  "/en",
  "/en/jobs",
  "/en/pricing",
  "/en/login",
  "/en/register",
  "/en/contact",
  "/en/companies",
  "/en/salaries",
  "/en/interviews",
  "/en/trust",
  "/en/learning",
];
// Resolved at runtime from the API (first published job / first company).
const DETAIL_PAGES = ["job", "company"] as const;
const CANDIDATE_PAGES = ["/en/candidate", "/en/candidate/applications", "/en/candidate/profile", "/en/candidate/settings"];
const EMPLOYER_PAGES = ["/en/employer", "/en/employer/jobs/new"];
const ADMIN_PAGES = ["/admin", "/admin/users", "/admin/jobs", "/admin/support", "/admin/reviews", "/admin/ops", "/admin/audit-logs"];
const SEEDED_PASSWORD = "Password123!";

type Theme = (typeof THEMES)[number];

async function newThemedPage(browser: Browser, theme: Theme, viewport: (typeof VIEWPORTS)[number], storageState?: string) {
  const context = await browser.newContext({ colorScheme: theme, viewport, storageState });
  // ThemeProvider reads this key; the pre-paint script in layout.tsx applies it.
  await context.addInitScript((value) => {
    try {
      window.localStorage.setItem("afritalent-theme", value);
    } catch {
      /* storage unavailable */
    }
  }, theme);
  return { context, page: await context.newPage() };
}

async function expectNoContrastViolations(page: Page, label: string) {
  // Best-effort settle: a Next.js link prefetch can stay pending under
  // Chromium 151 (Playwright 1.62), so bound the wait instead of letting it
  // consume the whole test timeout.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  // Let entry animations and theme transitions settle before measuring.
  await page.waitForTimeout(600);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  expect(isDark, `${label}: theme class`).toBe(label.includes(":dark:"));
  await test.info().attach(`${label}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const summary = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(-1)[0]?.trim()}`),
  );
  expect(summary, `${label}: color-contrast violations`).toEqual([]);
}

let candidateState: string | undefined;
let employerState: string | undefined;
let adminState: string | undefined;
const detailPaths: Record<(typeof DETAIL_PAGES)[number], string> = { job: "/en/jobs", company: "/en/companies" };

async function seededState(browser: Browser, email: string, home: RegExp, file: string) {
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

// Playwright restarts the worker after a failing test and re-runs beforeAll.
// The seeded sessions and detail paths are cached at a fixed path inside the
// run's output directory (wiped at the start of every run), so a restart reuses
// them instead of signing in again and tripping the login rate limit, which
// used to skip every remaining test after a single failure.
interface SetupCache {
  candidateState: string;
  employerState: string;
  adminState: string;
  detailPaths: typeof detailPaths;
}

test.beforeAll(async ({ browser }, testInfo) => {
  const authDir = join(testInfo.project.outputDir, ".auth", "visual-contrast");
  const cacheFile = join(authDir, "setup.json");
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8")) as SetupCache;
    if ([cached.candidateState, cached.employerState, cached.adminState].every((file) => existsSync(file))) {
      ({ candidateState, employerState, adminState } = cached);
      Object.assign(detailPaths, cached.detailPaths);
      return;
    }
  }
  mkdirSync(authDir, { recursive: true });

  const context = await browser.newContext();
  const page = await context.newPage();
  const email = process.env.VISUAL_CANDIDATE_EMAIL;
  const secretFromEnv = process.env.VISUAL_CANDIDATE_PASSWORD;
  if (email && secretFromEnv) {
    await page.goto("/en/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(secretFromEnv);
    await page.getByRole("button", { name: /sign in/i }).click();
  } else {
    await page.goto("/en/register");
    await page.waitForTimeout(3500); // bot shield rejects instant submissions
    await page.getByLabel("Full Name").fill("Contrast Check");
    await page.getByLabel("Email").fill(`e2e-contrast-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("Password123!x");
    await page.getByRole("button", { name: "Create Account" }).click();
  }
  await page.waitForURL(/\/en\/candidate/, { timeout: 60_000 });
  candidateState = join(authDir, "candidate-state.json");
  await context.storageState({ path: candidateState });
  await context.close();

  employerState = await seededState(browser, "employer@example.com", /\/en\/employer/, join(authDir, "employer-state.json"));
  adminState = await seededState(browser, "admin@example.com", /\/admin(\/|$)/, join(authDir, "admin-state.json"));

  // Detail pages: follow the first job / company link like a visitor would.
  const browse = await browser.newContext();
  const page2 = await browse.newPage();
  for (const [kind, list, pattern] of [
    ["job", "/en/jobs", /^\/en\/jobs\/[^/?#]+$/],
    ["company", "/en/companies", /^\/en\/companies\/[^/?#]+$/],
  ] as const) {
    await page2.goto(list);
    await page2.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    const hrefs = await page2.locator("main a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    const href = hrefs.find((h) => pattern.test(h));
    if (!href) throw new Error(`no ${kind} detail link on ${list}`);
    detailPaths[kind] = href;
  }
  await browse.close();

  const cache: SetupCache = { candidateState, employerState, adminState, detailPaths };
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
});

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    for (const path of PUBLIC_PAGES) {
      test(`public ${path} ${theme} ${viewport.name}`, async ({ browser }) => {
        const { context, page } = await newThemedPage(browser, theme, viewport);
        await page.goto(path);
        await expectNoContrastViolations(page, `${path}:${theme}:${viewport.name}`);
        await context.close();
      });
    }
    for (const kind of DETAIL_PAGES) {
      test(`public ${kind} detail ${theme} ${viewport.name}`, async ({ browser }) => {
        const { context, page } = await newThemedPage(browser, theme, viewport);
        await page.goto(detailPaths[kind]);
        await expectNoContrastViolations(page, `${kind}-detail:${theme}:${viewport.name}`);
        await context.close();
      });
    }
    for (const [role, pages, state] of [
      ["employer", EMPLOYER_PAGES, () => employerState],
      ["admin", ADMIN_PAGES, () => adminState],
    ] as const) {
      for (const path of pages) {
        test(`${role} ${path} ${theme} ${viewport.name}`, async ({ browser }) => {
          const { context, page } = await newThemedPage(browser, theme, viewport, state());
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          await expectNoContrastViolations(page, `${path}:${theme}:${viewport.name}`);
          await context.close();
        });
      }
    }
    for (const path of CANDIDATE_PAGES) {
      test(`candidate ${path} ${theme} ${viewport.name}`, async ({ browser }) => {
        const { context, page } = await newThemedPage(browser, theme, viewport, candidateState);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoContrastViolations(page, `${path}:${theme}:${viewport.name}`);
        await context.close();
      });
    }
  }
}
