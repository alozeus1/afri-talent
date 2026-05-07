# Phone Verification Test

- Problem: Phone verification setup is documented but needs regression coverage
  for candidate-facing behavior and failure modes.
- Expected behavior: Users can request and submit verification codes through the
  configured provider or a safe test stub; errors are rate-limited and clear.
- Affected area: phone/SMS verification routes, candidate verification UI,
  `docs/sms-verification-setup.md`.
- Assigned agent: QA Tester Agent with Backend Engineer Agent.
- Risk level: Medium.
- Acceptance criteria: Test mode can validate request/submit flow without real
  SMS secrets; invalid codes are rejected; rate limits are respected.
- Test plan: Backend API tests with provider mocks and Playwright smoke for UI.
- Human approval requirement: Required before enabling real SMS provider or
  modifying production messaging credentials.
