/**
 * Gate B — Domain schema E2E tests
 *
 * Verifies the new API routes introduced in Gate B:
 *  1. CandidateProfile GET/PUT (upsert)
 *  2. Resume registration (POST /api/profile/resumes)
 *  3. Presign endpoint (POST /api/files/presign)
 *  4. Notifications list, unread-count, mark-read, mark-all-read
 *  5. Billing status (returns FREE plan for seeded user)
 *  6. Employer cannot access candidate-only routes (role enforcement)
 *
 * Requires the backend running on API_BASE_URL (default http://localhost:4000).
 */

import { test, expect } from "@playwright/test";
import {
  API,
  TEST_CANDIDATE,
  TEST_EMPLOYER,
  loginAs,
} from "./fixtures/auth";

// ---------------------------------------------------------------------------
// 1. CandidateProfile CRUD
// ---------------------------------------------------------------------------

test.describe("CandidateProfile", () => {
  test("GET /api/profile returns null profile for fresh candidate", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/profile`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    // Body must have either a profile object or null
    expect("profile" in body || body === null).toBeTruthy();
  });

  test("PUT /api/profile upserts profile and returns updated data", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const update = {
      headline: "Senior Software Engineer",
      bio: "Building great products.",
      skills: ["TypeScript", "React", "Node.js"],
      preferredLocations: ["Remote", "Berlin"],
      openToRelocation: true,
      linkedinUrl: "https://linkedin.com/in/test-user",
    };

    const res = await request.put(`${API}/api/profile`, { data: update });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.headline).toBe(update.headline);
    expect(body.skills).toEqual(expect.arrayContaining(update.skills));
    expect(body.openToRelocation).toBe(true);
  });

  test("PUT /api/profile rejects invalid linkedinUrl", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.put(`${API}/api/profile`, {
      data: { linkedinUrl: "not-a-url" },
    });
    expect(res.status()).toBe(400);
  });

  test("employer cannot access GET /api/profile (candidate-only)", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/profile`);
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 2. Resumes
// ---------------------------------------------------------------------------

test.describe("Resumes", () => {
  test("GET /api/profile/resumes returns array", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/profile/resumes`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.resumes)).toBe(true);
  });

  test("POST /api/profile/resumes with valid s3Key registers resume", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    // First we need to get the candidate's userId from /api/auth/me
    const meRes = await request.get(`${API}/api/auth/me`);
    const { user } = await meRes.json();

    const s3Key = `resumes/${user.id}/test-resume-e2e.pdf`;

    const res = await request.post(`${API}/api/profile/resumes`, {
      data: {
        s3Key,
        fileName: "my-cv.pdf",
        fileSizeBytes: 204800,
        mimeType: "application/pdf",
        setActive: true,
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.s3Key).toBe(s3Key);
    expect(body.isActive).toBe(true);
  });

  test("POST /api/profile/resumes rejects s3Key for different user", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.post(`${API}/api/profile/resumes`, {
      data: {
        s3Key: "resumes/other-user-id-00000/stolen.pdf",
        fileName: "stolen.pdf",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
      },
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. Files presign (no S3_UPLOADS_BUCKET in dev → 503)
// ---------------------------------------------------------------------------

test.describe("Files presign", () => {
  test("POST /api/files/presign without S3 config returns 503 or presign URL", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.post(`${API}/api/files/presign`, {
      data: {
        fileName: "my-resume.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 204800,
      },
    });
    // In dev (no S3_UPLOADS_BUCKET): 503
    // In prod (bucket configured): 200 with { url, s3Key }
    expect([200, 503]).toContain(res.status());
    if (res.ok()) {
      const body = await res.json();
      expect(body.url).toBeTruthy();
      expect(body.s3Key).toMatch(/^resumes\//);
    }
  });

  test("POST /api/files/presign rejects unsupported contentType", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.post(`${API}/api/files/presign`, {
      data: {
        fileName: "photo.jpg",
        contentType: "image/jpeg",
        fileSizeBytes: 50000,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/files/presign rejects files over 10 MB", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.post(`${API}/api/files/presign`, {
      data: {
        fileName: "huge.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 11 * 1024 * 1024, // 11 MB
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Notifications
// ---------------------------------------------------------------------------

test.describe("Notifications", () => {
  test("GET /api/notifications returns paginated list", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/notifications`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.notifications)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(typeof body.pagination.total).toBe("number");
  });

  test("GET /api/notifications/unread-count returns numeric count", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/notifications/unread-count`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/notifications?status=UNREAD filters correctly", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(
      `${API}/api/notifications?status=UNREAD`
    );
    expect(res.ok()).toBe(true);
    const body = await res.json();
    for (const n of body.notifications) {
      expect(n.status).toBe("UNREAD");
    }
  });

  test("PUT /api/notifications/read-all marks all read", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);

    const res = await request.put(`${API}/api/notifications/read-all`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.updated).toBe("number");

    // Unread count should now be 0
    const countRes = await request.get(
      `${API}/api/notifications/unread-count`
    );
    const countBody = await countRes.json();
    expect(countBody.count).toBe(0);
  });

  test("PUT /api/notifications/:id/read returns 404 for nonexistent id", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.put(
      `${API}/api/notifications/nonexistent-id-00000/read`
    );
    expect(res.status()).toBe(404);
  });

  test("PUT /api/notifications/:id/read returns 403 for another user's notification", async ({
    request,
  }) => {
    // Login as employer
    await loginAs(request, TEST_EMPLOYER);

    // Get employer's notifications — take first one (if any)
    const listRes = await request.get(`${API}/api/notifications`);
    const listBody = await listRes.json();

    if (listBody.notifications.length === 0) {
      test.skip(); // nothing to test with
      return;
    }
    const notifId = listBody.notifications[0].id;

    // Now login as candidate and try to mark employer's notification read
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.put(
      `${API}/api/notifications/${notifId}/read`
    );
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. Billing status
// ---------------------------------------------------------------------------

test.describe("Billing", () => {
  test("GET /api/billing/status returns FREE plan for seeded candidate", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/billing/status`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.plan).toBe("FREE");
    expect(typeof body.status).toBe("string");
  });

  test("POST /api/billing/checkout requires plan field", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/billing/checkout`, {
      data: {}, // missing plan
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/billing/checkout with invalid plan returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/billing/checkout`, {
      data: { plan: "ULTRA_PREMIUM" },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 6. Health & readiness probes
// ---------------------------------------------------------------------------

test("GET /health returns ok with db connected", async ({ request }) => {
  const res = await request.get(`${API}/health`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.db).toBe("connected");
});

test("GET /live returns alive", async ({ request }) => {
  const res = await request.get(`${API}/live`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("alive");
  expect(typeof body.uptime).toBe("number");
});
