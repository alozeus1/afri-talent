# Employer Onboarding Rollout

## Objective

Reduce time from employer signup to first qualified shortlist while increasing visible platform trust.

## What Ships

- Guided employer onboarding at `/employer/onboarding`
- Activation-first employer dashboard at `/employer`
- ROI analytics dashboard at `/employer/analytics`
- Inline job quality and moderation preview in `/employer/jobs/new`
- Employer milestone and onboarding analytics events

## Success Metrics

- Employer onboarding completion rate
- Time from signup to first approved job
- Time from first approved job to first candidate view
- Time from first approved job to first qualified shortlist
- Qualified applicant rate by employer verification level
- Publish rate for first-job drafts after using job quality preview
- Upgrade CTA click-through from onboarding and analytics

## Rollout Plan

1. Enable for internal admins and seeded employer test accounts only.
2. Validate analytics events, onboarding persistence, and job preview quality against staging data.
3. Expand to newly registered employers while keeping the legacy dashboard accessible for support fallback.
4. Remove fallback once activation metrics are stable for one full weekly cohort.

## Manual QA Checklist

- New employer can open `/employer/onboarding` and save progress across all guided steps.
- Employer dashboard reflects onboarding completion, next action, trust status, and milestone state.
- Job composer shows quality score, moderation risk, and actionable tips before publish.
- Candidate search emits talent-results analytics without breaking search behavior.
- Viewing an applications list emits candidate-view analytics without affecting review workflows.
- Analytics page loads funnel, ROI, verification impact, and posting performance without empty-state crashes.
- Locale routes re-export correctly for employer dashboard, onboarding, analytics, and job posting.

## Support Notes

- Team member setup currently captures collaborator emails as onboarding state only; invite automation can follow later without changing the activation model.
- Posting eligibility still depends on trust thresholds. The onboarding experience should never imply that a badge exists unless trust checks have actually passed.
- If analytics event ingestion is degraded, the onboarding flow should still save and the dashboard should fall back to backend-derived milestone data.
