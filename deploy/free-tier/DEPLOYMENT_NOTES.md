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

Required Vercel environment variables (Production + Preview):

| Name | Value |
|---|---|
| `BACKEND_PROXY_ORIGIN` | `http://129.80.161.21:4000` |
| `NEXT_PUBLIC_API_URL` | `https://afri-talent.vercel.app` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://afri-talent.vercel.app` |

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
DATABASE_URL=postgresql://neondb_owner:<PASSWORD>@ep-delicate-dust-ai5a9mu3-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
FRONTEND_URL=https://afri-talent.vercel.app
PORT=4000
NODE_ENV=production
API_DOMAIN=localhost          # no domain/TLS on the VM (see mixed-content section)
JWT_SECRET=<openssl rand -base64 64>
ANTHROPIC_API_KEY=<key>       # required for AI features; AI_DISABLED=1 to run without
AI_DISABLED=1                 # currently on until the key is added
```

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
   from 0.0.0.0/0 (or restrict to Vercel egress if preferred).
2. On the VM (Oracle images ship restrictive iptables):
   `sudo iptables -I INPUT -p tcp --dport 4000 -j ACCEPT`
   (persist with `iptables-persistent` or netfilter-persistent save).

With the Vercel proxy in place, only Vercel's servers need to reach :4000 —
the browser never talks to the VM directly.

## Go-live checklist (remaining)

1. VM `.env`: real `DATABASE_URL` (Neon pooled) + `FRONTEND_URL` — **done per handoff**
2. VM: `./native-backend-start.sh` → `curl http://localhost:4000/health` shows `database=connected`
3. OCI + iptables: open TCP 4000 (see above), then `curl http://129.80.161.21:4000/health` from outside
4. Vercel: set the three env vars from the table above → **Redeploy**
5. Browser: `https://afri-talent.vercel.app/health` should return the backend health JSON (proves the proxy)
6. Run the 8-point browser test plan in `README.md` Step 4
7. Later: `ANTHROPIC_API_KEY` on the VM (flip `AI_DISABLED=0`), admin user + `BLOG_TRIGGER_ADMIN_TOKEN` for the weekly blog cron, Cloudflare Tunnel for a real API domain
