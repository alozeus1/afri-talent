# Resume Scanner Worker Runbook

The application accepts scanner **results** only through the authenticated
callback endpoint. It does not contain a malware-scanning worker. This runbook
is the operational contract for the separately deployed worker required before
enabling `RESUME_SCANNER_MODE=callback` in a shared environment.

## Safe application configuration

- Production and staging must explicitly set `RESUME_SCANNER_MODE` to
  `callback` or `disabled`.
- `callback` requires a scanner callback secret of at least 32 characters;
  startup validation and `/ready` fail when it is absent or weak.
- `disabled` returns `503` for new resume registration. Existing pending,
  rejected, quarantined, and errored resumes remain unavailable. It never
  marks a resume `CLEAN`.
- Inject `RESUME_SCANNER_WEBHOOK_SECRET` from the approved secret manager only.
  Do not place it in an image, Terraform output, source file, log, or worker
  command line.

## Worker contract

1. Poll or receive only server-created `ResumeScanJob` records in `PENDING` or
   retryable `FAILED` state. The worker needs no database credentials in
   callback mode; a scheduler with database access may enqueue opaque job
   identifiers.
2. Retrieve the exact job bucket, key, and object version. Use a read-only S3
   policy scoped to the resume/quarantine prefixes and a KMS decrypt policy
   scoped to that bucket's key. Never accept these values from a user.
3. Enforce a maximum object size before download, a bounded download timeout,
   a bounded ClamAV execution timeout, and a temporary directory with
   restrictive permissions. Delete temporary data after every outcome.
4. Map clean content to `CLEAN`; malware or malformed content to `REJECTED` or
   `QUARANTINED`; scanner/download/timeout failures to `ERROR`.
5. POST the result to `/api/webhooks/resume-scanner` with the exact raw JSON,
   a Unix-second timestamp, a fresh delivery UUID, and:

   ```text
   X-AfriTalent-Scan-Signature: v1=<HMAC-SHA256(timestamp + "." + raw body)>
   X-AfriTalent-Scan-Timestamp: <unix seconds>
   X-AfriTalent-Scan-Delivery-Id: <delivery UUID>
   ```

   The endpoint permits only a ±300 second skew. Retry the same delivery only
   when the body is byte-for-byte identical; generate a new delivery ID only
   for a genuinely new attempt.

## Reliability and observability

- Use bounded exponential backoff. `ERROR` remains retryable only below the
  job's `maxAttempts`; the application moves it to `EXHAUSTED` at the limit.
- Send terminal callback failures, repeated transport failures, and jobs that
  exhaust retries to a dead-letter queue for operator review. Do not retry a
  conflicting or stale delivery.
- Alert on pending backlog age, callback authentication failures, error rate,
  scan latency, infected/quarantined count, exhausted jobs, and callback
  delivery latency. Keep metrics free of filenames, keys, resume contents,
  signatures, and secrets.
- Rotate the callback secret through the approved secret manager with a staged
  worker/application rollout. Pause intake (`RESUME_SCANNER_MODE=disabled`)
  if scanner identity or callback integrity is in doubt.

## Historical resumes and incident response

- Historical resumes stay pending after migration. Inventory object existence,
  enqueue bounded batches, scan them, and expose each only after an
  authenticated `CLEAN` result. Do not bulk-mark historical files clean.
- Retain quarantined files and scan audit evidence according to the approved
  retention policy. Delete only through an approved, audited lifecycle process.
- During a scanner incident, set mode to `disabled`, pause worker intake, and
  investigate callback/audit records. Restoring service resumes scanning; it
  never restores access to unverified files.
