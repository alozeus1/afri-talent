# Runbook: Free Mode Go-Live

Owner: founder (human). This runbook is prepared by an agent; every step below
is a live change and must be run by a human. Nothing here has been applied.

## What "free mode" is

Two independent, reversible flags:

| Flag | Where | Effect | Value to enable |
|---|---|---|---|
| `NEXT_PUBLIC_FREE_MODE` | Frontend (Vercel), **build-time** | Hides paywalls, upgrade CTAs, plan pickers, Premium badges (`frontend/src/lib/free-mode.ts`) | exactly `true` |
| `FREE_MODE` | Backend (VM `.env`), runtime | Grants top-tier entitlements at read time (employers → `EMPLOYER_PREMIUM`, others → `PROFESSIONAL`). Never rewrites `Subscription` rows (`backend/src/lib/billing/free-mode.ts`) | exactly `true` (`1` does **not** work) |
| `AUTO_APPLY_ENABLED` | Backend (VM `.env`), runtime | Arms the auto-apply worker. Users still have to opt in individually (`CandidateAutopilotProfile.autoApplyEnabled`) | exactly `1` |

Always turn both free-mode flags on and off together. Frontend-only shows a
"free" UI that the backend still paywalls (403s). Backend-only grants access but
still shows upgrade CTAs.

Live topology (see `STAGING_RUNBOOK.md`): frontend on Vercel (auto-deploys on
merge to `main`); backend on the free-tier VM `tradebot-server`, synced by hand
with `deploy/free-tier/native/*`. The AWS ECS stack is suspended. Its
`deploy.yml` image build and `infra/terraform/accounts/dev-new/main.tf` env
now carry the same flags, so a future resume behaves the same way.

## New env vars on `feat/free-launch-sweep` (vs `main`)

Backend (all optional, safe defaults in code):

| Var | Default | Notes |
|---|---|---|
| `FREE_MODE` | off | set `true` |
| `FREE_MODE_MONTHLY_SKILL_LIMIT` | `30` | per-user monthly cap on the capped AI skills (career gap, salary negotiation) while in free mode |
| `AUTO_APPLY_ENABLED` | off | set `1` |
| `AUTOPILOT_DAILY_APPLY_CAP` | `20` | submit-guard daily cap |
| `EMAIL_DEV_LOG_LINKS` | off | dev-only: logs verification links. **Do not set in production** |

Behaviour change: when `MOCK_AI=1` or `AI_DISABLED=1`, `ANTHROPIC_API_KEY` is
no longer required at boot (`backend/src/config/env.ts`). Production keeps
`MOCK_AI=0`, so the key is still required there.

Frontend:

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_FREE_MODE` | build-time | set `true` |
| `INTERNAL_API_URL` | server-side only, optional | used by server components/SSR to reach the API over a private network (Docker). **Leave unset on Vercel** so it falls back to `NEXT_PUBLIC_API_URL` |

No new Prisma migrations exist on this branch at the time of writing (latest is
`20260713000000_add_calendar_reminder_sent`). Re-check before go-live, because
other lanes may merge into the branch first:

```bash
git diff --name-only origin/main...HEAD -- backend/prisma/migrations
git diff origin/main...HEAD -- backend/src frontend/src | grep -oE 'process\.env\.[A-Z_0-9]+|NEXT_PUBLIC_[A-Z_0-9]+' | sort -u
```

## Preconditions

1. `feat/free-launch-sweep` reviewed and merged to `main` through a PR, with CI green.
2. A recent DB backup or snapshot of the VM database (the start script runs `prisma migrate deploy`).
3. Someone on hand to run the smoke checklist right after the change.

## Step 1: Frontend (Vercel)

Vercel inlines `NEXT_PUBLIC_*` at build time, so a variable change only takes
effect after a **new build**.

1. Vercel dashboard → project → Settings → Environment Variables:
   - Add `NEXT_PUBLIC_FREE_MODE` = `true`, environment **Production** (optionally Preview too).
   - Check that `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BACKEND_URL` still point at the VM backend URL.
   - Do **not** add `INTERNAL_API_URL`.
   CLI alternative: `vercel env add NEXT_PUBLIC_FREE_MODE production` (enter `true`).
2. Redeploy Production. Merging to `main` triggers a build. If the variable was
   added after that build, run Deployments → latest Production → Redeploy, and
   **untick "Use existing Build Cache"**. CLI: `vercel --prod`.
3. To confirm, open the production site with no account and check that `/pricing` shows no paid-plan checkout buttons or upgrade CTAs.

## Step 2: Backend (VM `tradebot-server`)

Env file: `deploy/free-tier/.env`. Both `native-backend-start.sh` and the
compose path read it.

```bash
ssh tradebot-server
cd ~/afri-tech            # repo path on the VM
git pull                  # main, after the merge
cp deploy/free-tier/.env deploy/free-tier/.env.bak.$(date +%Y%m%d%H%M)

# Add or update these lines (edit by hand; do not duplicate keys):
#   FREE_MODE=true
#   AUTO_APPLY_ENABLED=1
#   FREE_MODE_MONTHLY_SKILL_LIMIT=30      # optional, default 30
#   AUTOPILOT_DAILY_APPLY_CAP=20          # optional, default 20
# Ensure these are NOT set: EMAIL_DEV_LOG_LINKS, MOCK_AI=1
grep -E '^(FREE_MODE|AUTO_APPLY_ENABLED|FREE_MODE_MONTHLY_SKILL_LIMIT|AUTOPILOT_DAILY_APPLY_CAP|MOCK_AI|AI_DISABLED|EMAIL_DEV_LOG_LINKS)=' deploy/free-tier/.env

cd backend
npm ci
npx prisma generate
npm run build
npx prisma migrate status --schema prisma/schema.prisma   # review pending migrations BEFORE restart

cd ../deploy/free-tier/native
./native-backend-stop.sh
./native-backend-start.sh   # runs `prisma migrate deploy`, then starts on :4000 and probes /health
./native-backend-status.sh
tail -n 100 backend.log
```

`prisma migrate deploy` applies pending migrations only and never resets
data. If `migrate status` reports a failed migration (P3009), stop. Do not
`migrate reset`. Follow `docs/runbooks/db-restore.md` or escalate.

## Step 3: Smoke checklist (production)

Backend:
- [ ] `curl -fsS https://<api-host>/health` returns 200.
- [ ] `backend.log` has no boot errors and no env validation failures.
- [ ] `backend.log` shows the auto-apply worker cycle running and **not** logging `disabled (AUTO_APPLY_ENABLED != 1)` (debug level, so check with debug logging if needed).

Candidate (fresh FREE-plan account):
- [ ] Sign up → verify email → log in.
- [ ] No upgrade CTA, paywall modal or "Premium" badge on dashboard, jobs, job detail, AI tools.
- [ ] A previously plan-gated AI feature (e.g. resume review, apply pack, career gap) returns a result, not 402/403.
- [ ] Autopilot settings let the user opt in to auto-apply. After opting in, AI-prepared applications appear for review and are never auto-submitted without review.

Employer (fresh account):
- [ ] Post a job → visible in `/jobs`.
- [ ] Talent search, analytics and ATS views (previously paid) load without an upgrade wall.

Admin:
- [ ] Admin dashboard loads. User and job management works.

Public:
- [ ] `/`, `/jobs`, `/pricing`, `/contact`, `/companies/:id` load. The contact form submits.
- [ ] Locale switcher still works and pages render without missing-key text.

## Step 4: Rollback (turn flags off)

Turning the flags off is reversible and needs no data migration. Subscription
rows were never changed, so paid users keep their plan and free users go back
to FREE.

Backend (VM):
```bash
cd ~/afri-tech/deploy/free-tier
# set FREE_MODE=false (or remove the line) and AUTO_APPLY_ENABLED=0 (or remove)
cd native && ./native-backend-stop.sh && ./native-backend-start.sh
```

Frontend (Vercel): set `NEXT_PUBLIC_FREE_MODE` to `false` (or delete it) for
Production, then Redeploy **without build cache**.

AWS stack (only if resumed): set repo variable `NEXT_PUBLIC_FREE_MODE=false`
and change `FREE_MODE`/`AUTO_APPLY_ENABLED` in
`infra/terraform/accounts/dev-new/main.tf` `backend_env` through a PR. The
deploy workflow applies Terraform on merge.

Code rollback (worst case): revert the merge commit on `main` through a PR.
Vercel redeploys the previous build, and on the VM you `git pull` and rebuild
(steps above). Migrations from this branch, if any were added later, are
additive and can stay in place.

After go-live or rollback, add a dated entry to `STAGING_RUNBOOK.md`
describing the live state.
