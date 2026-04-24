# Candidate Retention Lifecycle Architecture

## Goal
Increase repeat candidate engagement by turning AfriTalent into a trusted, low-noise, high-signal career companion instead of a passive job board.

## Lifecycle journeys

1. Saved search setup
   Candidate creates at least one saved search so AfriTalent can build a persistent interest graph.

2. Profile completion
   Candidates with incomplete profiles receive nudges until they reach an employer-ready completeness threshold.

3. Verification completion
   Candidates with weak trust signals are nudged toward phone, identity, and skills verification.

4. Application momentum
   Candidates with fresh strong-fit jobs but weak recent application activity receive momentum reminders.

5. Salary clarity
   Candidates with enough salary-market coverage for their target role receive pay-insight nudges.

6. Interview prep
   Candidates with live applications in review or shortlist stages receive mock interview recommendations.

## Recommendation strategy

- Base ranking comes from the job discovery layer and already weights relevance, freshness, employer trust, salary transparency, visa or relocation clarity, and candidate fit.
- Candidate retention recommendations reuse that ranking instead of creating a separate opaque scoring system.
- Already-applied jobs are filtered out.
- Weak matches under the ranking threshold are dropped instead of padding the feed.

## Anti-spam controls

- Notification preferences now include per-loop toggles instead of one broad on or off switch.
- A weekly budget caps lifecycle nudges per candidate.
- Minimum spacing between lifecycle nudges prevents clustering.
- Saved-search dispatch now respects `INSTANT`, `DAILY`, and `WEEKLY` cadence instead of treating frequency as display-only metadata.
- Lifecycle events use weekly dedupe keys so the same journey does not repeatedly fire in one week.

## Notification event model

Primary tables:

- `NotificationPreference`
  Stores candidate lifecycle opt-in state and volume caps.

- `CandidateLifecycleState`
  Stores per-candidate cadence state such as weekly send counts and last-send timestamps.

- `CandidateLifecycleEvent`
  Audit trail for retention sends with:
  - trigger type
  - channel
  - reason code
  - dedupe key
  - rendered title and body
  - linked in-app notification id
  - metadata payload

## API surfaces

- `GET /api/candidate-analytics/recommendations`
  Returns the trusted recommendation feed.

- `GET /api/candidate-analytics/retention-summary`
  Returns:
  - snapshot metrics
  - trusted recommendations
  - weekly digest preview
  - prioritized lifecycle journeys
  - experiment assignments
  - effective lifecycle preferences

- `GET /api/push/preferences`
- `PUT /api/push/preferences`
  Source of truth for lifecycle preference-center controls.

## Scheduler and delivery

- `job-matcher`
  Creates `JobAlert` records from saved searches and profile-based matching.

- `alert-dispatch`
  Sends saved-search alerts only when the search cadence is due.

- `candidate-retention`
  Evaluates weekly digest, profile, verification, application momentum, salary insight, visa or relocation, and interview prep loops.

## Analytics events

Recommended event set:

- `candidate_retention_summary_viewed`
- `candidate_journey_cta_clicked`
- `candidate_preferences_updated`
- `candidate_weekly_digest_viewed`
- `candidate_recommendation_clicked`
- `candidate_experiment_exposed`

## Experiments

Current deterministic experiment hooks:

- `digest_hero_v1`
  Variants: `control`, `trust_first`

- `recommendation_mix_v1`
  Variants: `fit_heavy`, `freshness_heavy`

These are assignment hooks only. Analysis should compare:

- return visits
- recommendation click-through rate
- application starts
- application submissions
- shortlist rate

## Success metrics

- 7-day and 28-day candidate return rate
- recommendation CTR
- saved-search creation rate
- applications per active candidate
- time from signup to first trusted recommendation click
- time from signup to first application
- shortlist rate for candidates with high trust scores
- notification unsubscribe rate
- notification volume per active candidate
