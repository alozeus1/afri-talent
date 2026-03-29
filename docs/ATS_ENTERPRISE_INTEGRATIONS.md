# ATS Enterprise Integrations

## Goal

Close AfriTalent's ATS credibility gap by upgrading Greenhouse, Lever, and Workable from basic job import into supportable, auditable employer integrations with health visibility and stage-sync readiness.

## Architecture

### Core models

- `ATSConnection`
  - Stores provider, external org identifier, encrypted credentials, webhook secret, sync toggles, health, last test, last webhook, and failure state.
- `ATSSyncRun`
  - Tracks manual syncs, retries, webhook-triggered imports, and application stage writeback runs with trigger, direction, counts, warnings, and errors.
- `ATSWebhookEvent`
  - Captures inbound webhook payloads, idempotency keys, processing status, and failure context.
- `ATSConnectionAuditLog`
  - Records connection saves, connection tests, sync starts/completions/failures, webhook handling, and stage writeback actions.
- `ATSApplicationLink`
  - Links AfriTalent applications to external ATS candidate/application records for stage sync and reconciliation.

### Sync engine

1. Employer saves credentials and configuration in `/api/ats/connections`.
2. Employer runs a connection test.
3. Manual sync or webhook-triggered sync creates an `ATSSyncRun`.
4. Imported jobs are normalized and upserted into AfriTalent jobs with source lineage.
5. Candidate applications to ATS-backed jobs create `ATSApplicationLink` records.
6. Employer application status changes trigger stage writeback runs when the connection is ready.
7. Inbound webhooks update `ATSWebhookEvent`, refresh application links, and can update local application status.

### Failure handling

- Provider calls use retry-with-backoff via `withRetry`.
- Failed syncs and failed webhook processing are written into `ATSSyncRun` and `ATSWebhookEvent`.
- Serious failures also emit dead-letter entries for ops follow-up.
- Connection health degrades automatically based on missing credentials, missing stage mappings, repeated failures, and test failures.

## Provider coverage

### Greenhouse

- Import: board jobs API
- Writeback: Harvest application move endpoint
- Webhooks: HMAC verification supported
- Required for full writeback readiness:
  - board token
  - Harvest API key
  - stage mappings
  - `performAsUserId`

### Lever

- Import: public postings API
- Writeback: opportunity stage update endpoint
- Webhooks: event-driven sync supported, shared-secret or provider token verification can be used
- Required for full writeback readiness:
  - site token
  - API key or OAuth token
  - stage mappings

### Workable

- Import: `spi/v3/jobs`
- Writeback: candidate move endpoint
- Webhooks: inbound subscription payloads supported
- Required for full writeback readiness:
  - account subdomain
  - API token with candidate scope
  - stage mappings using Workable stage slugs
  - `performAsUserId` / `member_id`

## Employer UX

- ATS dashboard with:
  - healthy, degraded, down, and needs-attention counts
  - webhook-enabled and two-way-enabled counts
  - per-provider readiness chips
- Connection management with:
  - credential replacement
  - secret management
  - stage mapping JSON
  - service user/member ID
  - connection test
  - sync now
  - retry last failed run
  - detailed logs and recent linked applications

## Admin visibility

- `/admin/integrations` shows:
  - provider breakdown
  - fleet health
  - recent failed syncs
  - recent failed webhooks
  - employer accounts needing ops review

## Enterprise readiness notes

- Two-way sync is only considered healthy when credentials, stage mappings, and provider-specific acting user metadata are present.
- AfriTalent never shows a connection as fully writeback-ready based on a saved token alone.
- Webhook processing is idempotent when providers send stable delivery IDs or event IDs.
- Stage writeback uses linked external IDs only. If a local application lacks an external ATS candidate/application reference, the system records manual-review state instead of pretending the sync succeeded.

## Rollout recommendations

1. Launch Greenhouse and Lever with employer beta accounts that can validate real stage mappings.
2. Enable Workable writeback only after confirming member IDs and stage slugs with pilot customers.
3. Add provider-side webhook provisioning automation as a follow-up once customer secrets and webhook ownership flows are finalized.
4. Monitor:
   - failed sync runs
   - failed webhook events
   - pending application links
   - writeback manual-review rate
