# AfriTalent Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│   PostgreSQL    │
│  (Next.js 16)   │     │ (Express + TS)  │     │   (Managed)     │
│    Vercel       │     │ Railway/Render  │     │ Supabase/RDS    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Environment Matrix

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `DATABASE_URL` | localhost:5432 | Managed PostgreSQL | Managed PostgreSQL (SSL) |
| `JWT_SECRET` | dev-secret | staging-secret | **strong-random-secret** |
| `FRONTEND_URL` | http://localhost:3000 | https://staging.afritalent.com | https://afritalent.com |
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | https://api-staging.afritalent.com | https://api.afritalent.com |

---

## Local Development

```bash
# Start PostgreSQL (Docker)
docker run -d --name afritalent-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=afritalent \
  -p 5432:5432 \
  postgres:16-alpine

# Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

---

## Docker Compose (Production Parity)

Test the full stack locally with production builds:

```bash
# Build and run all services
docker-compose up --build

# Run migrations (first time)
docker-compose run migrate

# Access
# - Frontend: http://localhost:3000
# - Backend:  http://localhost:4000
# - Database: localhost:5432
```

---

## Deployment Targets

### Frontend: Vercel (Recommended)

1. **Connect Repository**
   - Import project from GitHub
   - Set root directory to `frontend`

2. **Environment Variables**
   ```
   NEXT_PUBLIC_API_URL=https://api.afritalent.com
   ```

3. **Build Settings**
   - Framework: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **Deploy**
   - Automatic on push to `main`

### Backend: Railway (Recommended)

1. **Create Project**
   - New Project → Deploy from GitHub
   - Set root directory to `backend`

2. **Environment Variables**
   ```
   DATABASE_URL=<from-railway-postgres>
   JWT_SECRET=<generate-strong-secret>
   FRONTEND_URL=https://afritalent.com
   NODE_ENV=production
   PORT=4000
   ```

3. **Dockerfile Deployment**
   - Railway auto-detects Dockerfile

4. **Database**
   - Add PostgreSQL service in Railway
   - Copy `DATABASE_URL` to backend service

5. **Post-Deployment**
   ```bash
   # Run migrations (Railway CLI or console)
   npx prisma migrate deploy
   ```

### Backend: Render (Alternative)

1. **Create Web Service**
   - Connect GitHub repository
   - Root directory: `backend`
   - Environment: Docker

2. **Environment Variables**
   Same as Railway

3. **Build & Deploy**
   - Dockerfile path: `./Dockerfile`
   - Auto-deploy: On

### Database: Supabase (Alternative)

1. **Create Project**
   - Note the connection string

2. **Connection String Format**
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```

3. **SSL Configuration**
   - Add `?sslmode=require` to connection string for production

---

## CI/CD Pipeline

GitHub Actions runs on every push/PR to `main` and `develop`:

1. **Backend**
   - Install dependencies
   - Generate Prisma client
   - Validate Prisma schema
   - Type check
   - Build

2. **Frontend**
   - Install dependencies
   - Lint
   - Type check
   - Build

3. **Docker**
   - Build both images (verification only)

Pipeline fails on any error. Fix all issues before merging.

---

## Production Checklist

### Security
- [ ] Strong `JWT_SECRET` (min 64 chars, random)
- [ ] Database SSL enabled
- [ ] CORS restricted to production domain
- [ ] Environment variables secured (not in code)
- [ ] Rate limiting enabled on auth endpoints

### Infrastructure
- [ ] Managed PostgreSQL with backups
- [ ] HTTPS enforced on all endpoints
- [ ] Health check endpoints responding
- [ ] Logging and monitoring configured

### Database
- [ ] Migrations applied: `npx prisma migrate deploy`
- [ ] Seed data (optional): `npx prisma db seed`
- [ ] Indexes verified

### Testing
- [ ] Smoke test all critical flows
- [ ] Auth: register, login, me
- [ ] Jobs: list, filter, create (employer)
- [ ] Applications: submit, view
- [ ] Admin: moderation dashboard

---

## Health Checks

```bash
# Backend health
curl https://api.afritalent.com/health

# Frontend (implicit via Vercel/Next.js)
curl https://afritalent.com
```

---

## Rollback Procedure

### Vercel (Frontend)
- Go to Deployments → Select previous deployment → Promote to Production

### Railway (Backend)
- Go to Deployments → Rollback to previous deployment

### Database
- Restore from managed backup (Supabase/Railway dashboard)

---

## Monitoring (Recommended)

- **Error Tracking**: Sentry (see TRACK C)
- **Uptime**: UptimeRobot, Pingdom
- **Logs**: Railway/Render built-in logs
- **Metrics**: Vercel Analytics (frontend)

---

## Cost Estimates (Starter Tier)

| Service | Free Tier | Paid Starter |
|---------|-----------|--------------|
| Vercel | Yes | $20/mo |
| Railway | $5 credit/mo | ~$10/mo |
| Supabase | 500MB DB | $25/mo |
| **Total** | ~$5/mo | ~$55/mo |
