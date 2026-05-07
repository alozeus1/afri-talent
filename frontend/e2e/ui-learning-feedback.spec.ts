import { expect, test } from "@playwright/test";
import { API, TEST_ADMIN, loginAs } from "./fixtures/auth";

const LEARNING_FEEDBACK = `${API}/api/learning/feedback`;

test("learning page supports feedback submission and shows approved notes", async ({ page, request }) => {
  const uniqueComment = `The learning page layout is clear and the lab structure is easy to scan. ${Date.now()}`;
  await page.goto("/learning", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Premium Learning Labs" })).toBeVisible();
  await expect(page.getByRole("button", { name: /upgrade to unlock labs/i })).toBeVisible();

  const firstNameInput = page.locator('input[placeholder="First name"]:visible');
  if (!(await firstNameInput.isVisible())) {
    const feedbackButton = page.getByRole("button", { name: /^give feedback$/i });
    await feedbackButton.scrollIntoViewIfNeeded();
    await feedbackButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
  await expect(firstNameInput).toBeVisible();
  await firstNameInput.fill("Grace");
  await firstNameInput.evaluate((input) => {
    const el = input as HTMLInputElement;
    if (el.value !== "Grace") {
      el.value = "Grace";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.locator('input[placeholder="Last name"]:visible').fill("Hopper");
  const fiveStarRating = page.getByRole("radio", { name: "5" });
  await fiveStarRating.click();
  await expect(fiveStarRating).toHaveAttribute("aria-checked", "true");
  await page.getByRole("textbox", { name: /tell us what was useful/i }).fill(uniqueComment);
  await expect(page.getByRole("button", { name: /submit feedback/i })).toBeEnabled();
  await page.getByRole("button", { name: /submit feedback/i }).click();
  await expect(page.getByRole("status")).toContainText("Feedback submitted for review");

  await loginAs(request, TEST_ADMIN);
  const pendingRes = await request.get(`${LEARNING_FEEDBACK}?areaSlug=learning-hub&status=PENDING`);
  expect(pendingRes.ok()).toBe(true);
  const pendingBody = await pendingRes.json();
  const submittedFeedback = pendingBody.feedback.find(
    (entry: { id?: string; comment?: string }) => entry.comment === uniqueComment,
  );
  const feedbackId = submittedFeedback?.id as string | undefined;
  expect(feedbackId).toBeTruthy();

  const approveRes = await request.put(`${LEARNING_FEEDBACK}/${feedbackId}/moderate`, {
    data: { action: "approve" },
  });
  expect(approveRes.ok()).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /approved learner notes/i })).toBeVisible();
  await expect(page.getByText("Anonymous").first()).toBeVisible();
  await expect(page.getByText(uniqueComment)).toBeVisible();
});
