# Africa Global Talent Platform

A full-stack MVP application connecting African tech talent with global opportunities.

## Start Here

For a fast project orientation, read [AGENT_BOOTSTRAP.md](./AGENT_BOOTSTRAP.md) first.

For the current live deployment state, staging URLs, AWS resource names, recovery steps, and troubleshooting workflow, read [STAGING_RUNBOOK.md](./STAGING_RUNBOOK.md) next.

Agent-specific pointers:

- Codex: reads [AGENTS.md](./AGENTS.md)
- Claude: reads [CLAUDE.md](./CLAUDE.md)
- Droid or other agents: start with [AGENT_BOOTSTRAP.md](./AGENT_BOOTSTRAP.md)

----

## MVP Scope (LOCKED)

> **This MVP scope is locked. Any new features must go to Phase 4+.**

### Included Features
- Authentication (register / login / me) with JWT
- Jobs CRUD + filters + pagination
- Applications workflow (apply, track, review)
- Resources (read-only listing and detail)
- Admin moderation (job approval/rejection)
- Role-based dashboards (Candidate, Employer, Admin)

### Explicitly Excluded (Phase 4+)
- Payments
- Messaging / Chat
- Notifications
- Referrals
- AI matching
- External integrations
- Forgot-password backend flow

---

## Tech Stack

### Backend
- Node.js 20
- Express.js
- Prisma ORM
- PostgreSQL
- JWT Authentication
- TypeScript

### Frontend
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4

## Prerequisites

- Node.js 20+
- PostgreSQL database running on localhost:5432
- npm or yarn

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd ~/Desktop/afri-tech

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

**Backend** (`backend/.env`):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
FRONTEND_URL="http://localhost:3000"
PORT=4000
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Setup Database

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed the database
npm run prisma:seed
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on http://localhost:4000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on http://localhost:3000

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | Password123! |
| Candidate | candidate@example.com | Password123! |
| Employer | employer@example.com | Password123! |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

### Jobs
- `GET /api/jobs` - List published jobs (public)
- `GET /api/jobs/:slug` - Get job details (public)
- `POST /api/jobs` - Create job (employer only)
- `PUT /api/jobs/:id` - Update job (employer only)
- `DELETE /api/jobs/:id` - Delete job (employer only)
- `GET /api/jobs/employer/my-jobs` - List employer's jobs

### Applications
- `POST /api/applications` - Apply to job (candidate only)
- `GET /api/applications/my` - List candidate's applications
- `GET /api/applications/job/:jobId` - List job applications (employer only)
- `PUT /api/applications/:id/status` - Update application status (employer only)

### Resources
- `GET /api/resources` - List published resources
- `GET /api/resources/:slug` - Get resource details
- `GET /api/resources/categories` - List categories

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/jobs/pending` - Pending job reviews
- `PUT /api/admin/jobs/:id/review` - Approve/reject job
- `GET /api/admin/users` - List users

## Pages

### Public
- `/` - Home page
- `/jobs` - Job search with filters
- `/jobs/[slug]` - Job detail page
- `/resources` - Resources hub
- `/resources/[slug]` - Resource article
- `/login` - Login page
- `/register` - Registration page

### Authenticated
- `/candidate` - Candidate dashboard
- `/employer` - Employer dashboard
- `/employer/jobs/new` - Post new job
- `/employer/jobs/[id]/applications` - View job applications
- `/admin` - Admin moderation dashboard

## Project Structure

```
afri-tech/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── lib/
│       │   ├── prisma.ts
│       │   └── jwt.ts
│       ├── middleware/
│       │   └── auth.ts
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── jobs.ts
│       │   ├── applications.ts
│       │   ├── resources.ts
│       │   └── admin.ts
│       └── server.ts
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx (Home)
        │   ├── jobs/
        │   ├── resources/
        │   ├── login/
        │   ├── register/
        │   ├── candidate/
        │   ├── employer/
        │   └── admin/
        ├── components/
        │   ├── ui/
        │   ├── layout/
        │   └── jobs/
        └── lib/
            ├── api.ts
            └── auth-context.tsx
```

## User Roles

- **CANDIDATE**: Can browse jobs, apply to jobs, track applications
- **EMPLOYER**: Can post jobs, manage job listings, review applications
- **ADMIN**: Can moderate jobs, view platform statistics, manage users

## Features

- JWT-based authentication
- Role-based access control
- Job search with filters (keyword, location, type, seniority)
- Job application tracking
- Admin moderation workflow (job approval/rejection)
- Responsive design with Tailwind CSS

---

## Production Readiness Checklist

### Before Deployment
- [ ] Change `JWT_SECRET` to a secure random string (32+ characters)
- [ ] Update `DATABASE_URL` for production database
- [ ] Set `FRONTEND_URL` to production domain
- [ ] Set `NEXT_PUBLIC_API_URL` to production API URL
- [ ] Run `npm run build` in both backend and frontend
- [ ] Run database migrations: `npx prisma migrate deploy`

### Security Notes
- JWT tokens expire after 7 days (configurable in `backend/src/lib/jwt.ts`)
- Passwords are hashed with bcrypt (10 rounds)
- CORS is configured to only allow the frontend origin
- All protected routes require valid JWT in Authorization header

### Environment Variables

**Backend (required):**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `FRONTEND_URL` | Frontend origin for CORS |
| `PORT` | Server port (default: 4000) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google OAuth |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | Enable Apple OAuth |
| `SES_FROM_EMAIL` | Sender used for email verification/reset emails |
| `ENABLE_API_DOCS` | Set `true` to expose `/api/docs` in production |
| `PHASE4_SOCIAL_ENABLED` | Enable social graph/profile endpoints (`/api/social/*`) |
| `PHASE4_SALARY_NEGOTIATION_ENABLED` | Enable salary negotiation assistant (`/api/salary-negotiation/*`) |
| `PHASE4_UNIVERSITY_API_ENABLED` | Enable university partner API (`/api/university-partners/*`) |
| `PHASE4_EMPLOYER_AI_ENABLED` | Enable employer AI tools (`/api/employer/ai/*`) |
| `PHASE4_BOTS_ENABLED` | Enable WhatsApp/Telegram bot integration routes (`/api/bots/*`) |
| `BOT_WEBHOOK_SECRET` | Shared secret for inbound bot webhook calls |

**Frontend (required):**
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS` | Show seeded demo credentials in local/non-prod UI |

## Additional Docs

- OpenAPI/Swagger: `GET /api/docs` and raw spec at `GET /api/docs/spec.json`
- Google for Jobs validation playbook: [docs/GOOGLE_FOR_JOBS_VALIDATION.md](./docs/GOOGLE_FOR_JOBS_VALIDATION.md)
- Phase 3 technical design: [docs/PHASE3_TECHNICAL_DESIGN.md](./docs/PHASE3_TECHNICAL_DESIGN.md)
- Phase 3 analytics event model: [docs/PHASE3_ANALYTICS_EVENT_MODEL.md](./docs/PHASE3_ANALYTICS_EVENT_MODEL.md)
- Phase 3 billing localization plan: [docs/PHASE3_BILLING_LOCALIZATION_PLAN.md](./docs/PHASE3_BILLING_LOCALIZATION_PLAN.md)
- Phase 3 phased rollout plan: [docs/PHASE3_ROLLOUT_PLAN.md](./docs/PHASE3_ROLLOUT_PLAN.md)
- Phase 4 moat architecture and API contracts: [docs/PHASE4_MOAT_ARCHITECTURE.md](./docs/PHASE4_MOAT_ARCHITECTURE.md)
- QA test matrix (Phase 1/2): [docs/qa/PHASE12_TEST_PLAN_MATRIX.md](./docs/qa/PHASE12_TEST_PLAN_MATRIX.md)
- QA manual checklist (Phase 1/2): [docs/qa/PHASE12_MANUAL_QA_CHECKLIST.md](./docs/qa/PHASE12_MANUAL_QA_CHECKLIST.md)
- QA bug severity rubric: [docs/qa/BUG_SEVERITY_RUBRIC.md](./docs/qa/BUG_SEVERITY_RUBRIC.md)
- QA release readiness report: [docs/qa/PHASE12_RELEASE_READINESS_REPORT.md](./docs/qa/PHASE12_RELEASE_READINESS_REPORT.md)
- QA go/no-go checklist: [docs/qa/GO_NO_GO_CHECKLIST.md](./docs/qa/GO_NO_GO_CHECKLIST.md)


   •  Frontend: http://localhost:3000
   •  Backend API: http://localhost:4000

   Demo credentials (from seed data):

   Role      │ Email                 │ Password    
   ----------+-----------------------+-------------
   Candidate │ candidate@example.com │ Password123!
   Employer  │ employer@example.com  │ Password123!
   Admin     │ admin@example.com     │ Password123!

   Key pages to test:
   •  /jobs -- Job search with Quick Apply, visa/relocation filters
   •  /salaries -- Salary comparison tool
   •  /interviews -- Interview experiences
   •  /immigration -- Visa tracker (candidate only)
   •  /learning -- Learning hub
   •  /notifications -- Notification center
   •  /candidate/profile -- Profile editor
   •  /candidate/applications -- Application tracker
   •  /candidate/skills -- Skills assessments
   •  /candidate/calendar -- Interview calendar
   •  /candidate/referrals -- Referral system
   •  /candidate/analytics -- Profile analytics
   •  /admin/users -- User management (admin only)
   •  /admin/reviews -- Review moderation (admin only)
