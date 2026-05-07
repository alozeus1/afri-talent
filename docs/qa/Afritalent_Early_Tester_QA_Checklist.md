# AfriTalent Early Tester QA Checklist

Date: 2026-04-28

## Smoke Tests

- Open the homepage and confirm navigation works on desktop and mobile widths.
- Sign up or log in with a test account.
- Confirm protected candidate pages redirect anonymous users to login.
- Open `/learning`, search for `AWS`, filter by category and difficulty, start a lesson, and mark it complete.
- Open `/interviews`, expand an interview card, click Helpful once, refresh, and confirm it cannot be clicked repeatedly from the same browser.
- Open `/candidate/interview-prep`, choose `DevOps Engineer`, answer a question, and confirm feedback appears.
- Open `/candidate/resume-builder`, confirm weak inputs show guidance, generate or fallback gracefully, and confirm warnings against false claims are visible.
- Open `/candidate/cover-letter`, select each tone family, force an invalid or unavailable generation path, and confirm an editable fallback template appears.
- Submit a local early-tester feedback rating on Learning, Resume, Cover Letter, Interview Prep, Job Match, and Application Tracker surfaces.
- Open job search, apply filters, save a job if authenticated, and confirm the UI does not crash.
- Open a job detail/card and confirm match/trust information is visible where available.
- Open resume builder/review pages and confirm empty states guide the user.
- Open cover letter page and confirm generated or fallback content is editable and copyable.
- Open application tracker and manually update at least one status if test data exists.
- Add a local application note and follow-up date; refresh and confirm local state remains in the same browser.

## Critical Workflow QA

- Profile creation: missing required information should be visible and recoverable.
- Resume workflow: AI failures should show fallback guidance, not a blank screen.
- Cover letter workflow: output should not invent experience; user should be warned to review before submitting.
- Job match display: labels should avoid fake precision when data is incomplete.
- Application assistant: user consent must be explicit before any external submission.
- Trust workflow: scam warnings should be understandable and not overclaim verification.
- Feedback capture: when implemented, submissions should be visible to admins or documented as local-only.
- Application tracker: local-only notes and reminders must be clearly labeled until backend persistence exists.

## Mobile Checks

- Cards should not overflow at 375px width.
- Filter controls should wrap cleanly.
- Buttons should remain at least finger-tappable size.
- Textareas should be usable without horizontal scrolling.
- Fixed/floating buttons should not cover form submit buttons.

## Accessibility Checks

- Keyboard can focus filters, lesson buttons, helpful buttons, and modal close controls.
- Helpful button has `aria-pressed` and useful labels.
- Lesson modal has a close control with an accessible label.
- Form labels are visible or accessible.
- Error messages are readable and not color-only.

## Known Limitations

- Learning progress is local-only in early tester mode.
- Early-tester feedback is local-only in this pass.
- Application notes, follow-up dates, and expanded candidate-facing statuses are local-only in this pass.
- Interview helpful vote backend does not yet enforce one vote per user.
- Some AI workflows depend on external model/service configuration.
- Email/push notification behavior is not validated in this pass.
- Employer directory credibility depends on real verified employer data.

## Recommended Automated Tests Next

- Add Playwright smoke flow for learning lesson completion.
- Add Playwright test for interview helpful vote no-spam behavior.
- Add mocked API tests for cover letter fallback behavior.
- Add mocked API tests for resume AI failure fallback.
- Add job-search test that verifies match explanation rendering.
