import { expect, test } from "@playwright/test";
import { API, TEST_ADMIN, loginAs } from "./fixtures/auth";

const LEARNING_FEEDBACK = `${API}/api/learning/feedback`;

test("learning page supports feedback submission and shows approved notes", async ({ page, request }) => {
  await page.goto("/learning", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Premium Learning Labs" })).toBeVisible();
  await expect(page.getByRole("button", { name: /upgrade to unlock labs/i })).toBeVisible();

  await page.getByRole("button", { name: /give feedback/i }).click();
  await page.getByLabel("First name").fill("Grace");
  await page.getByLabel("Last name").fill("Hopper");
  await page.getByRole("radio", { name: "5" }).click();
  await page.getByRole("textbox", { name: /tell us what was useful/i }).fill(
    "The learning page layout is clear and the lab structure is easy to scan.",
  );
  await page.getByRole("button", { name: /submit feedback/i }).click();
  await expect(page.getByRole("status")).toContainText("Feedback submitted for review");

  await loginAs(request, TEST_ADMIN);
  const pendingRes = await request.get(`${LEARNING_FEEDBACK}?areaSlug=learning-hub&status=PENDING`);
  expect(pendingRes.ok()).toBe(true);
  const pendingBody = await pendingRes.json();
  const feedbackId = pendingBody.feedback[0]?.id as string | undefined;
  expect(feedbackId).toBeTruthy();

  const approveRes = await request.put(`${LEARNING_FEEDBACK}/${feedbackId}/moderate`, {
    data: { action: "approve" },
  });
  expect(approveRes.ok()).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Approved learner notes")).toBeVisible();
  await expect(page.getByText("Grace Hopper")).toBeVisible();
  await expect(page.getByText("The learning page layout is clear and the lab structure is easy to scan.")).toBeVisible();
});
