# AfriTalent Early Tester Release Plan

Date: 2026-04-28

## What Was Improved

- Learning Hub now has practical starter lessons across AWS, cybersecurity, DevOps, AI career tools, and job search skills.
- Interview prep now includes role-based tracks, realistic question categories, starter insights, and fallback feedback.
- Interview helpful voting now works for demo/fallback content and logged-in API content without unlimited repeat votes from the same browser.
- Product documentation now separates functional, beta/demo, and pending areas.

## Now Functional Enough For Early Testers

- Browse learning lessons even if the backend learning catalog is empty.
- Search/filter learning lessons by category, difficulty, free status, and text.
- Start a lesson and mark it complete locally.
- Practice mock interview questions for high-priority global roles.
- Receive structured interview answer feedback, with an AI path and local fallback path.
- Mark interview experiences as helpful with loading, error, and accessibility support.

## Still Mocked, Beta, Or Pending

- Learning completion is local-only until backend progress tracking is added.
- Interview helpful votes prevent repeat local votes, but backend per-user vote persistence is still needed.
- AI feedback depends on configured AI service availability.
- Employer directory should remain honest if real verified employers are not present.
- Email/push notifications should remain future-facing unless infrastructure is verified.

## Risky Changes To Avoid Before Early Testing

- Do not change auth provider behavior while OAuth and credential configuration are still being validated.
- Do not introduce database migrations for progress/votes/feedback without a migration plan and rollback path.
- Do not market auto-apply as fully automated unless submission proof, consent, and audit trails are complete.
- Do not display demo employers, testimonials, or job trust labels as real verified claims.

## Data Needed

- Real candidate profiles and resumes from early testers.
- Feedback on job match quality and missing job categories.
- Verified employer/career-page sources.
- Actual application outcomes to calibrate match explanations and trust scoring.

## 30/60/90-Day Roadmap

### 30 Days

- Add early tester feedback capture and admin review.
- Add dashboard next-best-action panel.
- Add backend persistence for learning progress and helpful votes.
- Add smoke tests for resume, cover letter, job save/apply, and interview prep.

### 60 Days

- Add employer verification workflow and moderation queue.
- Improve job match explanations using profile completeness and resume skills.
- Add in-app notification reminders for follow-up and incomplete resumes.
- Add content management path for lessons, interview insights, and scam tips.

### 90 Days

- Add verified employer profiles and candidate discovery pilot.
- Add calibrated recommendation analytics.
- Add email notification integration if engagement signals justify it.
- Expand AI application assistant with stronger audit logs and candidate consent checkpoints.

