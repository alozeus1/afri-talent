# Local Docker end-to-end stack

Runs postgres (pgvector), backend and frontend on Docker Desktop (arm64 or amd64)
with **no Anthropic, SES, S3 or Stripe keys**. AI runs in stub mode (`MOCK_AI=1`)
and email links are written to the backend log instead of being sent.

## Ports

| Service  | Host port                  | Notes                                   |
|----------|----------------------------|-----------------------------------------|
| frontend | `3000`                     | http://localhost:3000                   |
| backend  | `4000`                     | http://localhost:4000/health            |
| postgres | `127.0.0.1:55432`          | debug only; host 5432 is often taken    |

Redis, Mailpit and other ports (6379, 1025, 8025) are not used or published.

## Start

```bash
cp .env.example .env        # optional; every value has a local default
docker compose up --build -d
docker compose ps           # wait until all three show (healthy), ~1-3 min
curl -fsS localhost:4000/health
```

The backend entrypoint runs `prisma migrate deploy` on start, so a fresh volume is
migrated automatically.

## Seed demo data (destructive)

```bash
docker compose --profile seed run --rm seed
```

The seed **deletes** users, jobs, applications and related rows before inserting
demo data. Run it only against a fresh local database, never against data you
want to keep. It fetches `tsx` on first run, so it needs internet access.

Seeded accounts (password `Password123!`):

- `candidate-pro@example.com` (also `candidate@example.com`), email already verified
- `employer@example.com`, verified company with website `https://example.com`, can post jobs
- `admin@example.com`

After seeding, http://localhost:3000/en/jobs shows the seeded job cards.

## Verify a newly registered account

No email is sent locally. The backend logs the link instead:

```bash
docker compose logs backend | grep 'DEV email verification'
```

Open the `verifyUrl` (http://localhost:3000/verify-email?token=...) in the browser.
Password reset links are logged the same way (`grep 'DEV password reset'`).
Candidates must verify their email before they can apply.

## Known limits

- **File uploads (CV, avatars) return 503**: no S3 bucket is configured.
  Applying without an uploaded CV works.
- **New employers cannot post right away.** Posting needs employer trust
  verification: register with a company-domain email (not gmail/outlook etc.) and
  set a matching company website in the verification screen first. Or use the
  seeded `employer@example.com`.
- The job aggregator is off (`DISABLE_SCHEDULER=1`), so only seeded and locally
  posted jobs appear. Set `DISABLE_SCHEDULER=0` in `.env` to crawl public job boards
  (needs internet).
- Auto-apply and phase-4 bots are disabled (`AUTO_APPLY_ENABLED=0`,
  `PHASE4_BOTS_ENABLED=0`).

## Stop

```bash
docker compose down        # keeps the database volume
docker compose down -v     # also deletes this stack's database volume
```
