# Free-Tier Deployment — As-Built Record (July 2026)

The live free-tier deployment diverged from the Docker walkthrough in
`README.md` in three ways. This file records what actually runs, why, and how
to operate it. **Never put real secrets in this file** — they live only in
`deploy/free-tier/.env` on the VM and in the Vercel dashboard.

## Topology (as deployed)

| Piece | Where | Notes |
|---|---|---|
| Frontend | Vercel — project `afri-talent`, root dir `frontend` | `https://afri-talent.vercel.app` |
| Database | Neon — project **`jc2026`**, DB `neondb`, branch `main` | pgvector enabled; pooled connection string |
| Backend | Oracle Always Free **ARM** VM at `129.80.161.21` — **native Node, no Docker** | Node 24 LTS at `/home/ubuntu/node`, repo at `/home/ubuntu/afri-talent` |
| Redis | none (optional — the app degrades gracefully without `REDIS_URL`) | add later via local `redis-server` if needed |
| Weekly blog | host crontab → `native/native-blog-weekly-cron.sh` | replaces EventBridge + Lambda |

### Why it diverged

1. **No Docker on the VM** — the ARM host/image made Docker impractical, so
   the backend runs natively: dependencies installed, Prisma generated, and
   `npm run build` done directly on the VM. Run scripts live in
   `deploy/free-tier/native/` (start / stop / status / blog cron).
2. **VM cannot bind ports 80/443** — so there is no Caddy/TLS on the VM. The
   API listens on `http://129.80.161.21:4000` only.
3. **Neon is attached to a Vercel-managed organization** — new Neon projects
   must be created through the Vercel dashboard integration, so the existing
   `jc2026` project is used instead of a dedicated `afritalent` project.
   `CREATE EXTENSION IF NOT EXISTS vector;` has been run on it.

## The mixed-content constraint (and its fix)

Because the backend is HTTP-only, the HTTPS Vercel frontend **cannot call it
directly** — browsers block `https://` pages from making `http://` requests.

**Fix in place: Vercel proxy rewrites** (`frontend/next.config.ts`). When the
`BACKEND_PROXY_ORIGIN` env var is set on Vercel, the frontend proxies
`/api/*` and `/health` server-side to the VM. API calls become same-origin
HTTPS: browser → Vercel (HTTPS) → VM (HTTP, server-to-server — allowed).
CORS becomes a non-issue for browser traffic.

Required Vercel environment variables:

| Name | Value | Environments |
|---|---|---|
| `BACKEND_PROXY_ORIGIN` | `http://129.80.161.21:4000` | Production + Preview |
| `NEXT_PUBLIC_API_URL` | `https://afri-talent.vercel.app` | **Production only** |
| `NEXT_PUBLIC_BACKEND_URL` | `https://afri-talent.vercel.app` | **Production only** |

> The `NEXT_PUBLIC_*` URLs must NOT be set to the production host on Preview
> deployments: preview pages would call the production origin cross-origin,
> the `afri_csrf` cookie would be scoped to the production host, and mutating
> requests from previews would 403 (missing `X-CSRF-Token`). Preview builds
> are UI-review only; leave their `NEXT_PUBLIC_*` unset.

> ⚠️ The earlier setting `NEXT_PUBLIC_API_URL=http://129.80.161.21` was wrong
> twice over: missing the `:4000` port, and mixed-content blocked anyway.
> Use the table above and **redeploy** (NEXT_PUBLIC_* vars are inlined at
> build time).

**Upgrade path (recommended eventually):** Cloudflare Tunnel (`cloudflared`)
on the VM — outbound-only, needs no inbound ports at all, and gives a real
`https://api.<your-domain>` behind Cloudflare's free TLS. Then set
`NEXT_PUBLIC_API_URL` to that URL and drop `BACKEND_PROXY_ORIGIN`.

## VM `.env` (at `/home/ubuntu/afri-talent/deploy/free-tier/.env`)

Key values (placeholders here — real values only on the VM):

```
# Quotes are REQUIRED: the native scripts bash-source this file, and an
# unquoted & in the connection string would truncate the value.
DATABASE_URL="postgresql://neondb_owner:<PASSWORD>@ep-delicate-dust-ai5a9mu3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
FRONTEND_URL=https://afri-talent.vercel.app
PORT=4000
NODE_ENV=production
API_DOMAIN=localhost          # no domain/TLS on the VM (see mixed-content section)
JWT_SECRET=<openssl rand -base64 64>
ANTHROPIC_API_KEY=<key>       # required for AI features; AI_DISABLED=1 to run without
AI_DISABLED=1                 # currently on until the key is added
```

## Enabling email (SES) — verification emails, digests, notifications

Without `SES_FROM_EMAIL`, the backend logs a warning and records
`notification_delivery_skipped` — no email is ever sent (this includes the
registration verification email). To enable delivery:

1. **Verify a sender identity** — AWS Console → SES (region `us-east-1`) →
   Identities → Create identity → verify your from-address (or whole domain).
2. **Sandbox caveat** — new SES accounts can only deliver to *verified
   recipient* addresses. For real signups, request production access:
   SES → Account dashboard → Request production access (typically ~24h).
   Until then, verify your own test inboxes as recipients.
3. **Minimal IAM user** — create `afritalent-ses` with a policy allowing only
   `ses:SendEmail` and `ses:SendRawEmail`; generate an access key.
4. **Add to `.env`** on the VM:
   ```
   SES_FROM_EMAIL="noreply@yourdomain.com"   # the verified identity
   SES_REGION=us-east-1
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID="..."
   AWS_SECRET_ACCESS_KEY="..."
   ```
5. **Restart** (stop + start scripts below), then **test** by registering a
   fresh account — the verification email should arrive. If not,
   `tail -50 native/backend.log`: "SES not configured — email NOT sent"
   means step 4 didn't load; an SES error means identity/sandbox issues.

## Operating the native backend

```bash
cd /home/ubuntu/afri-talent/deploy/free-tier/native
./native-backend-start.sh    # runs prisma migrate deploy, then starts on :4000
./native-backend-status.sh   # process + /health
./native-backend-stop.sh
tail -f backend.log
```

**Updating to a new version:**
```bash
cd /home/ubuntu/afri-talent && git pull
cd backend && npm ci && npx prisma generate && npm run build
cd ../deploy/free-tier/native && ./native-backend-stop.sh && ./native-backend-start.sh
```

**Keep it alive across reboots** (simple crontab approach):
```
@reboot /home/ubuntu/afri-talent/deploy/free-tier/native/native-backend-start.sh
0 9 * * 1 /home/ubuntu/afri-talent/deploy/free-tier/native/native-blog-weekly-cron.sh >> $HOME/afritalent-blog.log 2>&1
```

## Oracle network note

Port 4000 must be open in **both** places for direct API access:
1. OCI Console → the VM's subnet → Security List → Ingress rule: TCP 4000
   from 0.0.0.0/0 (or restrict to Vercel egress if preferred). — **done 2026-07-02**
2. On the VM host firewall. Oracle Ubuntu images ship an iptables INPUT chain
   that ends in a catch-all `REJECT` rule, so the ACCEPT must be **inserted
   above it** (`-I`, not `-A`) from an SSH session with sudo:
   ```bash
   sudo iptables -L INPUT -n --line-numbers | tail -5   # find the REJECT line
   sudo iptables -I INPUT -p tcp --dport 4000 -j ACCEPT
   sudo netfilter-persistent save    # or: sudo apt-get install -y iptables-persistent
   ```

Diagnosis cheat: the backend binds `0.0.0.0` (verified — `app.listen(PORT)`),
so from outside a **timeout** = firewall/Security List still blocking, while
**connection refused** = the app itself is down.

With the Vercel proxy in place, only Vercel's servers need to reach :4000 —
the browser never talks to the VM directly.

## VM code sync (this VM's git lacks the remote-https helper)

The VM's checkout began as a source snapshot; its minimal git build cannot
fetch over https (`git-remote-https` missing) and outbound ssh is blocked.
Two ways to sync with `main`:

- **With sudo (preferred, one-time):** `sudo apt-get install -y git` replaces
  the minimal build, then normal `git fetch origin main && git checkout -f -B
  main origin/main` works (`.env` is untracked and survives).
- **Without sudo (tarball sync):**
  ```bash
  cd /home/ubuntu
  curl -fsSL https://github.com/alozeus1/afri-talent/archive/refs/heads/main.tar.gz | tar xz
  rsync -a --exclude='.env' --exclude='node_modules' --exclude='dist' \
    afri-talent-main/ afri-talent/
  rm -rf afri-talent-main
  cd afri-talent/backend && npm ci && npx prisma generate && npm run build
  ```

> ⚠️ Until the VM is synced past commit `664e297`, its copy of the blog cron
> script pre-dates the CSRF fix and will 403 against
> `/api/admin/blog/trigger`. Sync before arming the weekly crontab entry.
> After syncing, the run scripts live under `deploy/free-tier/native/`
> (the pre-sync snapshot had them directly in `deploy/free-tier/`).

## Go-live checklist (remaining as of 2026-07-02)

1. ~~VM `.env`: real `DATABASE_URL` (quoted!) + `FRONTEND_URL`~~ **done**
2. ~~VM: backend built + running, healthy on 127.0.0.1:4000~~ **done**
3. ~~OCI Security List: TCP 4000 ingress~~ **done**
4. ~~Vercel: `BACKEND_PROXY_ORIGIN` + same-origin `NEXT_PUBLIC_*` set, production redeployed~~ **done**
5. **VM host firewall: insert the iptables ACCEPT above the REJECT rule (see above) — the last blocker for external reachability**
6. Verify: `curl http://129.80.161.21:4000/health` from outside, then `https://afri-talent.vercel.app/health` (proves the full proxy chain)
7. Sync the VM to `main` (see "VM code sync") so it has the CSRF-fixed cron + `native/` scripts; re-arm crontab (`@reboot` start + Monday blog trigger)
8. Run the 8-point browser test plan in `README.md` Step 4
9. Later: `ANTHROPIC_API_KEY` on the VM (flip `AI_DISABLED=0`), admin user + `BLOG_TRIGGER_ADMIN_TOKEN`, rotate the Neon password, Cloudflare Tunnel for a real API domain
