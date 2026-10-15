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
import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;
const PUBLIC_PAGES = ["/en", "/en/jobs", "/en/pricing", "/en/login", "/en/register", "/en/contact"];
const CANDIDATE_PAGES = ["/en/candidate"];

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
  await page.waitForLoadState("networkidle").catch(() => undefined);
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

test.beforeAll(async ({ browser }, testInfo) => {
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
    await page.getByLabel("Email").fill(`contrast-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("Password123!x");
    await page.getByRole("button", { name: "Create Account" }).click();
  }
  await page.waitForURL(/\/en\/candidate/, { timeout: 60_000 });
  candidateState = testInfo.outputPath("candidate-state.json");
  await context.storageState({ path: candidateState });
  await context.close();
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
