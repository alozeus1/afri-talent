# Candidate Retention Manual QA Checklist

## Pre-flight
- Confirm staging candidate account exists with at least one saved search, one submitted application, and a partially completed profile.
- Confirm notification preferences record exists for the candidate.
- Confirm at least 5 published jobs exist, including:
  - 2 verified-employer jobs
  - 2 salary-transparent jobs
  - 1 visa or relocation-friendly job
- Confirm background workers for lifecycle nudges, saved-search alerts, and weekly digests are enabled in staging.
- Confirm test inbox and push-notification test device/browser are available.

## Candidate Dashboard
- Candidate dashboard loads without console errors.
- Retention summary card renders saved search count, trust score, open applications, and remaining notification budget.
- Journey checklist renders correct status labels (`READY`, `DONE`, `WATCH`) from API data.
- Journey CTA links route to the expected candidate surface.
- Push opt-in card renders and does not block the rest of the dashboard when push is unsupported.

## Candidate Analytics
- `/candidate/analytics` loads without redirect loops for a signed-in candidate.
- “Retention control tower” card renders summary metrics from `retention-summary`.
- “Weekly digest preview” renders headline, trusted role count, verified employer count, salary transparency count, and freshness window.
- Recommended jobs section shows trusted/fresh jobs instead of empty state when recommendations exist.
- Empty state appears when recommendations are absent and links to profile completion.
- Clicking a recommended job opens the correct job detail page.

## Preference Center
- `/candidate/preferences` loads current notification preferences.
- Toggling saved-search alerts persists after refresh.
- Toggling weekly digest persists after refresh.
- Toggling application reminders persists after refresh.
- Toggling profile-completion nudges persists after refresh.
- Toggling verification-completion nudges persists after refresh.
- Toggling visa or relocation alerts persists after refresh.
- Toggling salary insight nudges persists after refresh.
- Toggling interview prep recommendations persists after refresh.
- Changing max notifications per week persists after refresh.
- Changing minimum hours between notifications persists after refresh.

## Saved Search and Alert Journeys
- Candidate can create a saved search with alerting enabled.
- Daily and weekly saved-search options both save correctly.
- Saved-search page shows the new alert frequency and match count.
- Alert sender respects cadence and does not send duplicate notifications inside the cooldown window.
- Saved-search recommendations prioritize trusted and fresh jobs.

## Notification Quality and Throttling
- Weekly digest email content includes trusted jobs, verified employers, and freshness framing.
- Application reminder only appears for open applications meeting reminder criteria.
- Profile completion nudge stops after profile reaches completion threshold.
- Verification completion nudge stops after required verification state is reached.
- Visa or relocation alert only fires when the job actually matches candidate preferences.
- Notification budget prevents over-sending beyond configured weekly limit.
- Minimum-hours spacing prevents two lifecycle notifications from firing too close together.

## Analytics and Experimentation
- Analytics ingestion records:
  - `candidate_retention_summary_viewed`
  - `candidate_weekly_digest_viewed`
  - `candidate_experiment_exposed`
  - `candidate_recommendation_clicked`
  - `candidate_preferences_updated`
- Experiment exposure payload includes experiment key and variant.
- Summary-view payload includes recommendation count and saved-search count.

## Accessibility and Mobile
- Preference toggles are keyboard reachable and screen-reader readable.
- Number/select controls for notification cadence remain usable on mobile widths.
- Analytics cards stack cleanly on small screens without clipped content.
- Recommended job cards remain tappable and do not create double-focus traps.

## Exit Criteria
- No blocking defects in saved-search alerts, weekly digests, or preference persistence.
- No duplicate lifecycle notifications observed during QA window.
- Analytics events arrive in staging telemetry for the tested flows.
- Product, engineering, and support owners agree the retention journeys are ready for staged rollout.
