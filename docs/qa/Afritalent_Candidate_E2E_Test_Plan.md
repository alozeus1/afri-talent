# AfriTalent Candidate End-to-End Test Plan

This test plan defines the repeatable journey a QA engineer or automated suite (e.g. Playwright) must run to ensure the candidate platform is production-ready and free of critical defects.

## Test User
- **Email:** `afritalent.test.candidate+001@example.com`
- **Role:** Candidate
- **Plan:** Professional (for AI tests)

## Scenario 1: Authentication & Onboarding
1. Navigate to `/login` and submit valid credentials.
2. Verify redirect to `/candidate`.
3. Verify missing items are actionable (clicking "Add missing skills" routes to `/candidate/profile`).

## Scenario 2: Profile Completion
1. Navigate to `/candidate/profile`.
2. Fill out Headline, Bio, Target Roles, and append 3 skills.
3. Click **Save Changes**.
4. Verify success toast appears.
5. Reload page and verify completeness percentage updated.

## Scenario 3: Trust & Verification
1. Navigate to `/candidate/trust`.
2. Click **Start verification** for Phone Number.
3. Submit a valid phone number.
4. Verify OTP input appears and preview code is shown (if in non-production).
5. Submit OTP and verify "Phone verification completed" success message.
6. Verify Authenticity Score increases.

## Scenario 4: AI Job Matches & Assistant
1. Navigate to `/candidate/ai-assistant`.
2. Upload a `.txt` resume file. Verify text extraction populates the textbox.
3. Enter a target job description manually or search for one.
4. Click **Match Jobs**.
5. Verify no `500 Internal Server Error` occurs.
6. Verify status shows `OK` and match score appears.
7. Click **Apply Pack** to generate tailored resume and cover letter.
8. Verify text downloads work correctly for `.txt`.

## Scenario 5: Preferences & Routing
1. Navigate to `/candidate/preferences`.
2. Verify 404 is NOT thrown.
3. Toggle "Weekly Job Digest" and click **Save**.
4. Verify success confirmation.

---
**Note:** If any of these scenarios fail, immediately update `Afritalent_Dead_Link_And_Endpoint_Audit.md` and open a high-priority defect ticket.
