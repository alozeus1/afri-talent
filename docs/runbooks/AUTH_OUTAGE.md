# Runbook: Auth Outage

## Trigger

- Login failures spike
- Users cannot log in or sessions are invalid unexpectedly

## Immediate Actions

1. Confirm whether the issue is login, session validation, or OAuth-only.
2. Check backend auth logs and recent auth-related deploy/config changes.
3. Validate JWT secret, Redis availability, and cookie/session behavior.

## Diagnose

- `login_failure` operational metrics
- Backend logs around `/api/auth/login`
- Redis health for token blocklist and session-adjacent flows
- Any recent changes to auth middleware, cookie config, or OAuth provider config

## Mitigate

- Roll back auth-related release if newly introduced.
- Restore auth secrets or cookie config if drifted.
- If Redis is degraded, confirm fail-open behavior is acceptable and communicate degraded sign-out/token-revocation state.

## Exit Criteria

- Login success back at target range
- No active auth-related SEV2/SEV1 alarm
- Smoke-tested candidate and employer sign-in works

