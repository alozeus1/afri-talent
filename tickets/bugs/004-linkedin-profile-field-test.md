# LinkedIn Profile Field Test

- Problem: Optional profile URL fields have caused validation errors when users
  clear or omit values.
- Expected behavior: LinkedIn, GitHub, and portfolio fields accept valid URLs,
  empty strings, null, or omitted values according to UI behavior.
- Affected area: candidate profile form and backend profile validation.
- Assigned agent: QA Tester Agent with Backend Engineer Agent.
- Risk level: Low.
- Acceptance criteria: Saving a profile with a LinkedIn URL succeeds; clearing
  the field succeeds; invalid URL feedback is clear.
- Test plan: Backend profile API validation tests and Playwright profile save
  regression.
- Human approval requirement: Required before merge only.
