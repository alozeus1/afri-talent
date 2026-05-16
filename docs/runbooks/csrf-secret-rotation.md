# CSRF secret rotation runbook

The CSRF protection in `backend/src/middleware/csrf.ts` derives its HMAC from
the `CSRF_SECRET` SSM parameter (falling back to `JWT_SECRET` if unset). Tokens
are signed double-submit cookies — rotating the secret invalidates every
in-flight token, so every SPA tab will see one CSRF 403 on its next mutating
request and must reload to pick up a new token.

## When to rotate

| Trigger | Required cadence | Action owner |
|---|---|---|
| Quarterly hygiene | Every 90 days | Platform on-call |
| Suspected compromise | Immediate | Incident commander |
| Departure of any engineer with prod SSM access | Within 24 hours | Security lead |
| `JWT_SECRET` rotation (because CSRF falls back to it) | Same window | Whoever rotates JWT |

## Procedure

The rotation is a single SSM `put-parameter` call followed by a rolling
restart. There is no migration step — tokens are stateless.

```bash
# 1. Generate a new secret (48 random bytes, base64url-encoded).
NEW_SECRET="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')"

# 2. Write it to SSM in the target environment. Use --overwrite.
aws ssm put-parameter \
  --name "/afritalent/<env>/CSRF_SECRET" \
  --value "${NEW_SECRET}" \
  --type SecureString \
  --overwrite \
  --region us-east-1

# 3. Force a rolling restart of the backend ECS service so new tasks pick up
#    the new secret. CloudFront sessions stay alive; the SPA will refresh its
#    CSRF token on the next /api/auth/me call.
aws ecs update-service \
  --cluster afritalent-dev \
  --service afritalent-dev-backend \
  --force-new-deployment \
  --region us-east-1
```

For prod, run the same against the prod cluster (`afritalent-prod`) once that
environment exists.

## Validation

After deploy completes:

1. Hit `https://<env-host>/api/auth/me` from a logged-out browser — confirm
   the response sets the `afri_csrf` cookie with a new value.
2. From a logged-in session, attempt a mutating call (e.g. POST a job alert).
   Expect a single 403 with `code: CSRF_INVALID`, after which the SPA
   refreshes its token and the next attempt succeeds.
3. Check Sentry for any spike in `CSRF_INVALID` beyond the expected one-shot
   burst — sustained 403s after 15 minutes indicate a frontend that hasn't
   re-fetched `/api/auth/me`.

## Coupling with `JWT_SECRET`

The middleware falls back to `JWT_SECRET` when `CSRF_SECRET` is unset. This
keeps single-secret deployments working but means a `JWT_SECRET` rotation also
rotates the CSRF secret implicitly. If you rotate one without the other,
explicitly set `CSRF_SECRET` first so the fallback never kicks in mid-rotation.

## Pre-flight checklist

- [ ] Confirm SSM parameter path matches the environment (`dev` vs `prod`).
- [ ] Notify on-call channel: "CSRF secret rotation in <env> in 5 min."
- [ ] Have the backup secret value (previous one) ready in case you need to
      roll back within the 60-second window before ECS replaces tasks.
- [ ] Confirm the SPA build is current (>= the build that ships the
      `/api/auth/me` CSRF cookie reader). If not, defer.

## Rollback

If something goes wrong (e.g. ECS task fails health check after the rollout),
put the previous secret back via the same SSM `put-parameter` call and force
another rolling restart. Tokens issued under either secret remain valid as
long as both are listed in `getSecret`'s return (csrf-csrf accepts an array
of acceptable secrets), so a zero-downtime two-secret rotation is possible
but not implemented by default.

## History

| Date | Environment | Rotated by | Reason |
|---|---|---|---|
| _(none yet)_ | | | |
