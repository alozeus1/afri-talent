import { expect, test } from "@playwright/test";
import { API, loginAs } from "./fixtures/auth";

let backendAvailable = true;

test.beforeAll(async ({ request }) => {
  try {
    const health = await request.get(`${API}/health`);
    backendAvailable = health.ok();
  } catch {
    backendAvailable = false;
  }
});

test.beforeEach(() => {
  test.skip(!backendAvailable, "Backend service is not reachable");
});

test("api quality: OpenAPI docs and OAuth provider discovery", async ({ request }) => {
  const specRes = await request.get(`${API}/api/docs/spec.json`);
  expect(specRes.ok()).toBe(true);
  const spec = await specRes.json();
  expect(spec.openapi).toBe("3.0.3");
  expect(spec.paths["/api/auth/oauth/google/callback"]).toBeDefined();

  const providersRes = await request.get(`${API}/api/auth/oauth/providers`);
  expect(providersRes.ok()).toBe(true);
  const providersPayload = await providersRes.json();
  expect(Array.isArray(providersPayload.providers)).toBe(true);
});

test("candidate journey API smoke: signup -> verification status/send -> browse jobs -> apply -> upgrade", async ({
  request,
}) => {
  const email = `qa-candidate-${Date.now()}@example.com`;
  const password = "Password123!";

  const registerRes = await request.post(`${API}/api/auth/register`, {
    data: {
      email,
      password,
      name: "QA Candidate",
      role: "CANDIDATE",
    },
  });
  expect(registerRes.ok()).toBe(true);

  const statusRes = await request.get(`${API}/api/auth/email/status`);
  expect(statusRes.ok()).toBe(true);
  const statusPayload = await statusRes.json();
  expect(typeof statusPayload.verified).toBe("boolean");

  const sendVerificationRes = await request.post(`${API}/api/auth/email/send-verification`);
  expect([200, 429]).toContain(sendVerificationRes.status());

  const jobsRes = await request.get(`${API}/api/jobs?limit=1`);
  expect(jobsRes.ok()).toBe(true);
  const jobsPayload = await jobsRes.json();
  const firstJob = jobsPayload.jobs?.[0];
  test.skip(!firstJob, "No published jobs available for candidate apply smoke");

  const applyRes = await request.post(`${API}/api/applications`, {
    data: { jobId: firstJob.id },
  });
  expect([201, 400, 403]).toContain(applyRes.status());
  if (applyRes.status() === 403) {
    const body = await applyRes.json();
    expect(body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  }

  const checkoutRes = await request.post(`${API}/api/billing/checkout`, {
    data: { plan: "BASIC", interval: "MONTHLY" },
  });
  expect([200, 403, 503]).toContain(checkoutRes.status());
});

test("employer journey API smoke: signup -> post job -> upgrade", async ({ request }) => {
  const email = `qa-employer-${Date.now()}@example.com`;
  const password = "Password123!";

  const registerRes = await request.post(`${API}/api/auth/register`, {
    data: {
      email,
      password,
      name: "QA Employer",
      role: "EMPLOYER",
      companyName: "QA Hiring Inc",
      location: "Lagos, Nigeria",
    },
  });
  expect(registerRes.ok()).toBe(true);

  const meRes = await request.get(`${API}/api/auth/me`);
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.authenticated).toBe(true);
  expect(me.user?.role).toBe("EMPLOYER");

  const createJobRes = await request.post(`${API}/api/jobs`, {
    data: {
      title: `QA Platform Engineer ${Date.now()}`,
      description: "Build and scale secure hiring workflows.",
      location: "Remote",
      type: "FULL_TIME",
      seniority: "MID",
      salaryMin: 50000,
      salaryMax: 70000,
      currency: "USD",
    },
  });
  expect([201, 400, 403]).toContain(createJobRes.status());
  if (createJobRes.status() === 403) {
    const body = await createJobRes.json();
    expect(["EMAIL_VERIFICATION_REQUIRED", "EMPLOYER_TRUST_REQUIRED"]).toContain(body.code);
  }

  const checkoutRes = await request.post(`${API}/api/billing/checkout`, {
    data: { plan: "EMPLOYER_BASIC", interval: "MONTHLY" },
  });
  expect([200, 403, 503]).toContain(checkoutRes.status());
});

test("pricing localization + analytics + hero stats integration", async ({ request }) => {
  const africaPricing = await request.get(`${API}/api/pricing?region=AFRICA`);
  expect(africaPricing.ok()).toBe(true);
  const africaBody = await africaPricing.json();
  expect(africaBody.region).toBe("AFRICA");

  const europePricingByHeader = await request.get(`${API}/api/pricing`, {
    headers: { "cf-ipcountry": "FR" },
  });
  expect(europePricingByHeader.ok()).toBe(true);
  const europeBody = await europePricingByHeader.json();
  expect(europeBody.region).toBe("EUROPE");

  const regionsRes = await request.get(`${API}/api/pricing/regions`);
  expect(regionsRes.ok()).toBe(true);

  const localizationRes = await request.get(`${API}/api/pricing/payment-localization`);
  expect(localizationRes.ok()).toBe(true);
  const localizationBody = await localizationRes.json();
  expect(Array.isArray(localizationBody.regions)).toBe(true);

  const analyticsRes = await request.post(`${API}/api/analytics/events`, {
    data: {
      events: [
        {
          category: "ACQUISITION",
          eventName: "qa_pricing_page_view",
          sessionId: `sess-${Date.now()}`,
          path: "/pricing",
        },
      ],
    },
  });
  expect(analyticsRes.status()).toBe(202);

  const heroRes = await request.get(`${API}/api/public/stats`);
  expect(heroRes.ok()).toBe(true);
  const heroBody = await heroRes.json();
  expect(typeof heroBody.activeCandidates).toBe("number");
  expect(typeof heroBody.partnerCompanies).toBe("number");
  expect(typeof heroBody.jobsPosted).toBe("number");
});

test("security/resilience API smoke: webhook signature + region tamper + admin bypass", async ({
  request,
}) => {
  const invalidWebhook = await request.post(`${API}/api/webhooks/stripe`, {
    headers: {
      "stripe-signature": "invalid-signature",
      "content-type": "application/json",
    },
    data: { event: "fake" },
  });
  expect([400, 500, 503]).toContain(invalidWebhook.status());

  await loginAs(request, {
    email: "candidate@example.com",
    password: "Password123!",
  });

  const regionTamper = await request.post(`${API}/api/pricing/billing-country`, {
    data: { country: "123" },
  });
  expect(regionTamper.status()).toBe(400);

  const adminBypass = await request.get(`${API}/api/admin/stats`);
  expect(adminBypass.status()).toBe(403);
});
