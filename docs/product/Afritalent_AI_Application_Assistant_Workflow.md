# AfriTalent AI Application Assistant Workflow

The product should describe this as an application assistant until full automated submission, proof, consent, and audit logs are production-ready.

## Intended Flow

1. User selects a job.
2. System shows match quality, missing skills, trust signals, salary/location/visa notes, and apply path confidence.
3. User chooses a resume or builds one from profile data.
4. Assistant suggests resume tailoring without inventing experience.
5. Assistant generates an editable cover letter from profile, resume, selected job, and tone.
6. User reviews application notes and warnings.
7. User clicks the verified external apply link or explicitly consents to any supported assisted submission.
8. User marks application status.
9. System creates follow-up reminders and in-app notifications.

## Required Guardrails

- Do not auto-apply without explicit consent.
- Do not fabricate experience, credentials, salary history, immigration status, or employer-specific claims.
- Show whether an application was actually submitted or only prepared.
- Keep generated text editable.
- Show AI output warnings and review reminders.
- Log user-visible activity for prepared, copied, submitted, and status-changed actions.

## Statuses

- Saved
- Preparing
- Applied
- Interviewing
- Assessment
- Offer
- Rejected
- Withdrawn
- Follow-up needed

## Fallback Behavior

If AI is unavailable:

- Provide a plain cover letter template.
- Show resume improvement tips.
- Let the user manually track status.
- Keep external apply link available.

## Future Backend Work

- Persist application assistant sessions.
- Store generated document versions.
- Add consent records for assisted submission.
- Add reminder scheduling.
- Add admin visibility into failed or risky application-assistant events.

