# AfriTalent — Free-Tier Deployment (Vercel + Neon + one small VM)

Run the full webapp for **$0–5/month** without touching the existing AWS
Terraform stack. Same code, same Docker images, different hosts.

| Piece | Where | Cost |
|---|---|---|
| Frontend (Next.js) | **Vercel** free tier | $0 |
| Database (Postgres + pgvector) | **Neon** free tier | $0 |
| Backend API + workers + Redis | One small VM (Docker Compose) | $0 on Oracle Always Free, ~$5/mo on Hetzner/Lightsail |
| TLS certificates | Caddy (automatic Let's Encrypt) | $0 |
| Weekly blog pipeline | Host crontab (`blog-weekly-cron.sh`) | $0 |
| Email (SES) + uploads (S3) | Existing AWS account, pay-per-use | pennies |
| Claude API | Anthropic, usage-based | bounded by the DAILY_* caps |

What you give up vs. the AWS stack: high availability (one VM), autoscaling,
and WAF. The application behaves identically.

---

## Step 1 — Neon database (~5 minutes)

1. Go to [neon.tech](https://neon.tech) → sign in → **New Project**
   (name: `afritalent`, region: closest to your VM, Postgres 16).
2. In the project dashboard open the **SQL Editor** and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   (enables pgvector for semantic job matching)
3. Click **Connect** → select **Pooled connection** → copy the connection
   string. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   ```
   Keep it — this is your `DATABASE_URL`. Migrations run automatically the
   first time the backend boots.

> Neon free tier: 0.5 GB storage, autosuspends when idle and resumes in
> ~500ms on the first query. Fine for launch traffic.

## Step 2 — Backend VM (~20 minutes)

Any Ubuntu 22.04+ VM with ports 80/443 open works. For **$0**: Oracle Cloud
"Always Free" (VM.Standard.A1.Flex — up to 4 ARM cores / 24 GB RAM). For
~$5/mo with less setup friction: Hetzner CX22 or AWS Lightsail.

On the VM:

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Clone the repo
git clone https://github.com/alozeus1/afri-talent.git
cd afri-talent/deploy/free-tier

# 3. Configure
cp .env.example .env
nano .env     # fill in: DATABASE_URL (Neon), JWT_SECRET, FRONTEND_URL,
              # API_DOMAIN, ANTHROPIC_API_KEY, and any optional keys

# 4. Launch (builds the backend image, runs migrations, starts Redis + Caddy)
docker compose up -d --build

# 5. Verify
docker compose logs -f backend   # wait for "Running Prisma migrations..." then server start
curl -s http://localhost/health  # → {"status":"ok",...}
```

**DNS + TLS:** create an `A` record `api.yourdomain.com → <VM public IP>`,
set `API_DOMAIN=api.yourdomain.com` in `.env`, then
`docker compose up -d caddy`. Caddy fetches the certificate automatically —
`https://api.yourdomain.com/health` should return ok within a minute.

*No domain yet?* Leave `API_DOMAIN=localhost` and use `http://<VM-IP>/`
during testing (set `NEXT_PUBLIC_API_URL=http://<VM-IP>` in Step 3 — note
Vercel pages are HTTPS, so browsers will block mixed-content API calls;
a real domain + TLS is strongly recommended before sharing links).

**Weekly blog pipeline:**
```bash
chmod +x blog-weekly-cron.sh
crontab -e
# add:
0 9 * * 1 /home/ubuntu/afri-talent/deploy/free-tier/blog-weekly-cron.sh >> /var/log/afritalent-blog.log 2>&1
```
(Set `BLOG_TRIGGER_ADMIN_TOKEN` in `.env` first — log in as an admin user and
copy the JWT.)

**Nightly DB backup (recommended):**
```bash
# Neon keeps point-in-time history on free tier, but a belt-and-braces dump:
0 2 * * * docker compose -f /home/ubuntu/afri-talent/deploy/free-tier/docker-compose.yml exec -T backend npx prisma db execute --stdin <<< 'SELECT 1' && pg_dump "$DATABASE_URL" | gzip > /home/ubuntu/backups/afritalent-$(date +\%F).sql.gz
```

## Step 3 — Vercel frontend (~10 minutes)

1. [vercel.com](https://vercel.com) → **Add New… → Project** → import
   `alozeus1/afri-talent` from GitHub.
2. **Root Directory:** `frontend` (click *Edit* next to the detected root).
   Framework preset: Next.js (auto-detected). Build command/output: defaults.
3. **Environment Variables** (Production):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
   | `NEXT_PUBLIC_BACKEND_URL` | `https://api.yourdomain.com` |
4. **Deploy.** Vercel gives you `https://<project>.vercel.app`.
5. Back on the VM, set `FRONTEND_URL=https://<project>.vercel.app` in `.env`
   and `docker compose up -d backend` to reload CORS.
6. (Optional) add your apex domain to Vercel under **Settings → Domains**.

> Region-aware pricing works out of the box on Vercel — the backend reads
> the `x-vercel-ip-country` header for PPP price localization.

## Step 4 — Test live in a browser

Work through this list in order; each step exercises a different subsystem:

1. **Health:** `https://api.yourdomain.com/health` → `"status":"ok"`,
   `database=connected`, `redis=connected`.
2. **Homepage:** open the Vercel URL. Hero stats and (once jobs exist) the
   **Market pulse** section render with live numbers.
3. **Sign up** as a candidate → you land on the dashboard. The
   **Recommended For You** rail shows real jobs (or the "first 10 matches"
   card if the job table is still empty).
4. **Jobs:** `/jobs` → try the **Hires from Africa** filter pill; open a job
   and check the badge cluster.
   *No jobs yet?* Trigger one aggregation cycle:
   ```bash
   docker compose exec backend node -e "import('./dist/workers/aggregator-cron.js')"
   ```
   or simply wait — the scheduler runs the aggregator every 30 minutes.
5. **Profile → skills:** add skills, revisit the dashboard — instant matches
   personalize (matched-skill chips appear).
6. **Pricing:** `/pricing` shows region-localized prices (the region selector
   should preselect your country's region on Vercel).
7. **Admin:** promote your user in Neon's SQL editor:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
   ```
   then visit `/admin` and `/admin/blog` → **Trigger Pipeline Now** to test
   the blog agents end-to-end (needs `ANTHROPIC_API_KEY`). Approve the draft
   and confirm it appears at `/blog`.
8. **Salaries:** `/salaries` → submit an anonymous report, search it back,
   and confirm the overview stats card renders.

## Operations cheat-sheet

```bash
docker compose ps                     # status
docker compose logs -f backend        # live logs
docker compose up -d --build backend  # redeploy after git pull
docker compose restart backend        # restart only
docker compose down                   # stop everything (volumes persist)
```

**Updating:** `git pull && docker compose up -d --build` — the entrypoint
re-runs `prisma migrate deploy`, so schema changes apply automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/health` says `database=error` | Check `DATABASE_URL` (must be the **pooled** Neon string with `?sslmode=require`); Neon may take ~1s to resume from idle — retry once. |
| CORS errors in the browser console | `FRONTEND_URL` must exactly match the Vercel URL (https, no trailing slash); preview deployments need `ALLOWED_ORIGIN_REGEX`. |
| Caddy has no certificate | DNS `A` record must point at the VM **before** Caddy starts; ports 80/443 open in the VM's security list/firewall; `docker compose logs caddy`. |
| AI features 500 | `ANTHROPIC_API_KEY` unset — either set it or `AI_DISABLED=1` to hide AI features cleanly. |
| Blog cron does nothing | `BLOG_TRIGGER_ADMIN_TOKEN` expired (JWTs expire — re-login) or `BLOG_AUTOMATION_ENABLED != 1`. |
| Vercel build fails on env | Both `NEXT_PUBLIC_*` vars must be set **before** the build (they're inlined at build time); redeploy after changing them. |

## Graduation path

When revenue justifies managed infra, the AWS Terraform stack in
`infra/terraform/` is untouched and ready: build/push the same images and
swap DNS. Nothing in this directory needs to be undone.
