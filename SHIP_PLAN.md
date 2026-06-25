# Ship Plan — all in-flight branches (2026-06-10)

Every branch below is committed locally, verified (typecheck + lint + full backend
suite green at time of commit), and based on `origin/main` unless noted.
**Run the pushes in this order**; merge order matters because three branches touch
`dispatch.ts`/`scheduler.ts` and two are stacked.

## Already merged (no action)
PR #159 (H1 Flutterwave signature) · #160 (M1 idempotency) · #161 (M3 limiter keying)
· #163 (M3b internal-fetch secret) · A4 deps clearance · PR Q (EMAIL_DRAFT).

## Group 1 — independent, merge in any order, push now

```bash
git push -u origin fix/m5-price-catalog-validation     # 3f2fec6
git push -u origin fix/h2-restore-admin-totp           # 8595d29  (optionally: git branch -m fix/h2-admin-totp-grace-hardening first)
git push -u origin feat/ats-scanner-structural         # ee7f11c
```

| Branch | PR base | Gate before merge |
|---|---|---|
| fix/m5-price-catalog-validation | main | CI green. No env action (catalogs optional). |
| fix/h2-restore-admin-totp | main | CI green. NOTE: un-enrolled admins lose mutations until TOTP enrolment — comms to any admin users first. |
| feat/ats-scanner-structural | main | CI green. Additive API fields; frontend can adopt `structure`/`semanticScore` later. |

## Group 2 — PDF export stack (merge backend FIRST, then frontend)

```bash
git push -u origin feat/resume-pdf-export              # dff931f
git push -u origin feat/resume-pdf-export-frontend     # 2579d3a (stacked on the above)
```

1. PR: `feat/resume-pdf-export` → main.
   Gates: Docker image builds (new chromium layer, ~+400MB); run the
   chromium integration test inside the image (`CHROMIUM_PATH=/usr/bin/chromium
   npx vitest run src/__tests__/pdf-renderer.integration.test.ts`).
2. After it merges: PR `feat/resume-pdf-export-frontend` → main (retarget from the
   stack base). Gates: **frontend CI (typecheck + jest + Playwright)** — this branch
   could not be typechecked locally (sandbox limits); CI is the verification.
3. Rollout: set `RESUME_PDF_EXPORT_ENABLED=1` in staging env → click-test export.

## Group 3 — PR S (ATS adapters), merge AFTER Group 1/2 (touches dispatch/scheduler)

```bash
git push -u origin feat/pr-s-ats-adapters              # f66e047
```

PR → main. Note: based on a main snapshot that already includes PR Q, so it should
merge clean; if dispatch.ts conflicts with anything merged meanwhile, the EMAIL_DRAFT
and ATS branches are independent case blocks — keep both.
Gates before *enabling* (not merging):
- **HARD GATE:** one real sandbox submission per vendor before flipping its flag
  (`APPLY_ATS_GREENHOUSE_ENABLED` / `_LEVER_` / `_WORKABLE_`). Field contracts follow
  public API docs but were never exercised against live endpoints from the dev env.
- Greenhouse is easiest to verify (free test board + Job Board API key).
- ASHBY intentionally still stubbed (no ATSProvider enum member / connection flow).

## Staging env vars to set (GitHub Secrets → task env), independent of merges
- `FLUTTERWAVE_SECRET_HASH` — REQUIRED at boot wherever FLUTTERWAVE_SECRET_KEY is set (H1, already merged!)
- `INTERNAL_FETCH_SECRET` — same value in backend AND frontend server env (M3b, already merged; until set, SSR fetches count against the general limiter — degraded, not broken)
- `RESUME_PDF_EXPORT_ENABLED=1` — after Group 2 merges
- `REDIS_REQUIRED=1` — only once Redis is actually provisioned in the environment
- SES: production access (out of sandbox) + SPF/DKIM/DMARC on the sending domain before EMAIL_DRAFT carries real volume; monitor bounce/complaint rates

## Untracked working files (do not commit)
- `WORKSTREAM_A_TRIAGE.md`, `SHIP_PLAN.md` — session reports; keep or delete.

## Remaining roadmap (not yet built — honest status)
1. **Real-time messaging + read receipts** (Workstream B) — schema migration
   (`Message.readAt`), SSE or WebSocket transport, frontend wiring. ~1 PR backend + 1 frontend.
2. **PR T — OPERATOR_HANDOFF** (Computer Use apply track) — large; queue + worker exist.
3. **Ashby**: ATSProvider enum migration + connection flow + adapter.
4. **Workstream A leftovers:** IDOR 403/404 consistency sweep + PII-in-response sweep (hygiene; no confirmed exploit).
5. **Workstream C:** audit/flag-hide partial features (learning, career-gap, referrals, calendar, analytics).
6. **Workstream E:** legal pages content review, GDPR export/delete verification, WCAG pass.
7. **Workstream F (human-gated):** prod account, tfvars, DNS/SSL cutover for afri-talent.com,
   Stripe live + Flutterwave activation, smoke test enablement, status page.
8. EMAIL_DRAFT fast-follow: resume attachment via SES raw MIME; SES bounce webhook handling.
