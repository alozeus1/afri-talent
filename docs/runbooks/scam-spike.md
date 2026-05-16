# Runbook — Scam attack wave

**Severity:** P1 — trust & safety incident; mishandling damages platform reputation directly.
**Last updated:** 2026-05-15 (Wave 9 §10.3).

> **Playbook status:** TBD — capture during first incident.
>
> We have **zero observed history** of a coordinated scam wave on the platform as of 2026-05-15. This file exists so that when one does occur, on-call has a known landing place to start documenting; it is not a battle-tested procedure. The first commander to respond MUST update this file with the actual procedure they followed and the actual mitigations that worked.

## Trigger (anticipated)

- Spike in `JobReport` rows with classification `scam` from candidates over a short window.
- Trust & Safety dashboard (when Wave 10 ships) flagged employer cluster.
- External signal: news of a known scam targeting West Africa job-seekers; or social-media posts naming our platform.
- Sudden spike in employer signups with similar patterns (gmail/yahoo/etc + free-tier; phone numbers from a single country range).

## Pre-existing scaffolding (what we already have)

- `JobReport` table (model in `prisma/schema.prisma`).
- `docs/SCAM_ATTACK_WAVE.md` — broader threat-model doc (preexisting).
- `docs/TRUST_SAFETY_ARCHITECTURE.md` — what's been designed.
- Suspend mechanism: `User.suspended_at` column.
- Admin routes under `backend/src/routes/admin-*.ts`.

## Immediate triage skeleton

```bash
# 1. Spike in recent reports:
psql "$DATABASE_URL" -c "
  SELECT classification, COUNT(*) AS reports_last_hour
  FROM \"JobReport\"
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY 1
  ORDER BY 2 DESC;
"

# 2. Identify the offending employer(s):
psql "$DATABASE_URL" -c "
  SELECT j.employer_id, COUNT(r.id) AS reports
  FROM \"JobReport\" r
  JOIN \"Job\" j ON j.id = r.job_id
  WHERE r.created_at > NOW() - INTERVAL '24 hours'
    AND r.classification = 'scam'
  GROUP BY 1
  HAVING COUNT(r.id) >= 3
  ORDER BY 2 DESC
  LIMIT 20;
"

# 3. Recent activity for those employers:
# (paste the employer_ids into a follow-up query against Job + User)
```

## Mitigation (TBD — fill in after first incident)

Pattern-level options to consider:

- **Soft-suspend the offending employer(s):** `UPDATE "User" SET suspended_at = NOW() WHERE id IN (...)`.
- **Hide their jobs platform-wide:** `UPDATE "Job" SET visibility = 'hidden' WHERE employer_id IN (...)`.
- **Notify already-applied candidates:** template TBD in `lib/notifications/`; tone is calm, factual, no fearmongering.
- **Strengthen signup gating temporarily:** raise the threshold for new-employer visibility (e.g., require KYC before any job can publish).
- **Public communication:** post to status page only if user-facing data integrity is at risk; otherwise handle privately to avoid copycats.

## Documentation expectation (during the incident)

When this fires:

1. Open an incident in `docs/incidents/scam-wave-YYYY-MM-DD.md` (create the dir if missing).
2. Log every step taken with timestamps.
3. At resolution, edit THIS runbook to encode the procedure that worked.
4. Add a postmortem with root-cause + prevention items to `docs/postmortems/`.

## Escalation

- **Within 30 minutes of detection:** founder paged.
- **Within 2 hours:** decision on public communication (status page + email blast).
- **Within 24 hours:** postmortem + corrective actions; update Trust & Safety architecture.

## References

- `docs/SCAM_ATTACK_WAVE.md` — threat model.
- `docs/TRUST_SAFETY_ARCHITECTURE.md`
- `docs/TRUST_SAFETY_ROLLOUT_PLAN.md`
- `docs/CANDIDATE_AUTHENTICITY_ARCHITECTURE.md`
