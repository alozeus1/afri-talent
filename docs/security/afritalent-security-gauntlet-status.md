# AfriTalent security gauntlet status

- Current branch and HEAD: `security/afritalent-security-gauntlet` at `2ed3688` (pending ATS replay commit).
- Completed gates: account authority, BOLA foundations, upload ownership and
  signature checks, n8n callback integrity, and the full Stripe webhook gate.
- Current phase: external CV URL containment and remaining ATS replay checks.
- Verified finding: a signed `subscription.cancelled` payload could select an
  account by `customer.email` and synchronize after a missed update.
- Fixed: cancellation now resolves only a persisted Flutterwave customer
  binding and performs entitlement/audit work only after a count-checked write.
- Verified ATS findings: disabled connections accepted unauthenticated events;
  generic query tokens could authenticate requests; malformed Greenhouse HMACs
  could throw. Disabled connections now fail before persistence, query tokens
  are rejected, and comparisons fail closed.
- ATS replay hardening: missing provider delivery IDs now receive a durable
  SHA-256 raw-body fingerprint; only the expected event-identity uniqueness
  conflict is acknowledged as a duplicate.
- Verified external CV finding: allowed-domain matching accepted suffix lookalikes.
  New application CV URLs now require credential-free HTTPS and match allowlist
  domains only at DNS-label boundaries; external URLs remain unverified links.
- Open repository-local work: Flutterwave replay/concurrency/lifecycle suite;
  ATS webhook hardening; remaining authorization, file, browser, abuse,
  privacy, and repository-controlled infrastructure gates.
- External blockers: none recorded yet. Provider protocol freshness is limited
  to documented Flutterwave event identity/transaction verification; no
  unauthenticated timestamp will be used as a freshness signal.
- Last successful commands: `npx vitest run src/__tests__/webhooks-flutterwave.test.ts --no-file-parallelism`; `npm run typecheck`.
- Exact automatic resume step: add ATS retry and cross-connection nested
  application-link regressions, then complete the remaining Flutterwave
  idempotency/retry/concurrency and resume-quarantine gates.
