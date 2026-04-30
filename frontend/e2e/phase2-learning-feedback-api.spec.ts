import { expect, test } from "@playwright/test";
import { API, TEST_ADMIN, TEST_CANDIDATE, loginAs } from "./fixtures/auth";

const LEARNING_FEEDBACK = `${API}/api/learning/feedback`;

test("learning feedback can be submitted, moderated, and read back once approved", async ({ request }) => {
  await loginAs(request, TEST_CANDIDATE);

  const submitRes = await request.post(LEARNING_FEEDBACK, {
    data: {
      areaSlug: "learning-hub",
      lessonTitle: "Learning content usefulness",
      firstName: "Ada",
      lastName: "Lovelace",
      rating: 5,
      comment: "The learning page is clear and the new labs framework is easy to scan.",
      attachPhoto: true,
    },
  });
  expect(submitRes.ok()).toBe(true);
  const submitBody = await submitRes.json();
  expect(submitBody.feedback.status).toBe("PENDING");

  const pendingRes = await request.get(`${LEARNING_FEEDBACK}?areaSlug=learning-hub&status=PENDING`);
  expect(pendingRes.ok()).toBe(true);
  const pendingBody = await pendingRes.json();
  expect(pendingBody.feedback).toHaveLength(1);
  const feedbackId = pendingBody.feedback[0].id as string;

  await loginAs(request, TEST_ADMIN);
  const approveRes = await request.put(`${LEARNING_FEEDBACK}/${feedbackId}/moderate`, {
    data: { action: "approve" },
  });
  expect(approveRes.ok()).toBe(true);

  const publicRes = await request.get(`${LEARNING_FEEDBACK}?areaSlug=learning-hub`);
  expect(publicRes.ok()).toBe(true);
  const publicBody = await publicRes.json();
  expect(publicBody.feedback).toHaveLength(1);
  expect(publicBody.feedback[0].displayName).toBe("Ada Lovelace");
  expect(publicBody.feedback[0].comment).toContain("learning page");
});
