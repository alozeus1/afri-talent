# AfriTalent Multi-Agent Orchestration System
## Claude Code Prompt for Building AIApply Features at Scale

**Version:** 1.0
**Date:** April 9, 2026
**Target:** Implement AIApply-inspired features across AfriTalent platform with full agentic coordination

---

## SYSTEM OVERVIEW

You are orchestrating a team of specialized Claude Code agents to implement and integrate comprehensive job-search-as-a-service features into AfriTalent, positioning it as the African regional leader that surpasses AIApply.

### Architecture Pattern
```
User Request
    ↓
[ORCHESTRATOR AGENT] ← understands codebase, routes work, tracks state
    ├─→ [BACKEND ARCHITECT] ← API routes, Prisma schema, database
    ├─→ [FRONTEND ARCHITECT] ← React components, Next.js pages, UX
    ├─→ [AI INTEGRATION AGENT] ← Claude API, GPT-5.4 integration, LLM flows
    ├─→ [INFRASTRUCTURE AGENT] ← AWS, Terraform, Environment variables
    ├─→ [DATABASE AGENT] ← Migrations, seed data, data integrity
    └─→ [QA/REVIEWER AGENT] ← Testing, validation, before thumbs-up
         ↓
    [CI/CD DEPLOYMENT] ← Using afritalent-operator skill
```

---

## PART 1: CODEBASE INTELLIGENCE FOR ORCHESTRATOR

### Current Architecture Context
Your codebase is an **Express + Prisma + Next.js stack** with sophisticated modular routing and feature isolation:

**Backend Structure:**
- Entry: `backend/src/server.ts` → `app.ts` (route mounting)
- Routes: `backend/src/routes/` (30+ feature routes organized by domain)
- Database: Prisma schema + migrations in `backend/prisma/`
- Workers: Scheduler in `backend/src/workers/`
- Middleware: Security, auth, rate limiting in `backend/src/middleware/`
- Libraries: Reusable code in `backend/src/lib/` (prisma, redis, sentry, billing, etc.)

**Frontend Structure:**
- Framework: Next.js App Router
- Pages: `frontend/src/app/` (app router structure)
- Components: `frontend/src/components/` (reusable UI)
- Hooks: `frontend/src/hooks/` (custom React hooks)

**Deployment:**
- Environment: AWS App Runner + RDS + ElastiCache
- State: Terraform in `infra/terraform/`
- CI/CD: GitHub Actions workflows in `.github/workflows/`
- Status: Staging is live and operational

### Existing AI/Skills Routes (Already in Codebase)
```typescript
// These routes already exist and can be extended:
- /api/skills/resume-builder/* (AI Resume generation)
- /api/skills/job-matcher/* (Job matching)
- /api/skills/application-writer/* (Cover letters, etc.)
- /api/skills/career-advisor/* (Career guidance)
```

### Current Integrations to Build Upon
- **Authentication:** OAuth, email verification, password reset
- **AI Chat:** `routes/chat.ts` with consent tracking
- **Job Aggregation:** `routes/aggregator.ts` (Apify, multiple sources)
- **Resume Parsing:** `routes/resume-parser.ts`
- **Applications:** `routes/applications.ts` (tracking, status)
- **Analytics:** Candidate and employer analytics
- **Webhooks:** ATS integrations and external systems

---

## PART 2: SPECIALIZED AGENT ROLES & RESPONSIBILITIES

### 1. ORCHESTRATOR AGENT (Lead Coordinator)
**Role:** Understand codebase, delegate work, track dependencies, manage state

**Responsibilities:**
- [ ] Maintain codebase map (routes, schemas, migrations, dependencies)
- [ ] Parse AIApply analysis and break into implementable tasks
- [ ] Delegate to specialists (backend, frontend, AI, infra)
- [ ] Detect conflicts (duplicate work, missing dependencies)
- [ ] Track implementation order (schema → routes → UI → tests)
- [ ] Ensure agents use correct file paths from `AGENTS.md` conventions
- [ ] Update `docs/plans/` with progress
- [ ] Approve final pull request bundles

**Key Commands:**
```bash
# Orchestrator validates codebase structure
cd backend && npm run lint && npm run typecheck
cd frontend && npm run lint && npx tsc --noEmit
cd infra/terraform && terraform fmt -check -recursive

# Check existing routes
grep -r "router\\.post\|router\\.get" backend/src/routes/*.ts | head -30
```

**Decision Matrix:**
- If feature overlaps existing route: EXTEND (don't duplicate)
- If new domain: CREATE new route file
- If schema changes: Coordinate with DATABASE AGENT first
- If auth required: Verify against `routes/auth.ts`

---

### 2. BACKEND ARCHITECT AGENT
**Role:** Design and implement server-side features, API routes, integrations

**Focus Areas:**
1. **Resume Builder API** (`/api/skills/resume-builder/generate`)
   - Accept user resume data + job description
   - Call Claude API for ATS optimization
   - Store formatted resume in database
   - Return tailored resume + match score

2. **Cover Letter Generator** (`/api/skills/application-writer/generate-letter`)
   - Accept job description + user profile
   - Generate personalized cover letter
   - Store in applications table
   - Version control (user can regenerate)

3. **Auto-Apply Service** (`/api/autopilot/*` - extend existing)
   - Credit-based system (integrate with billing)
   - Batch job matching algorithm
   - Automated submission with tracking
   - Status updates (Applying, Applied, Pending, Rejected, Interview)

4. **Interview Prep APIs** (`/api/mock-interviews/*` - extend existing)
   - Question generation (role-specific)
   - Answer evaluation
   - Feedback delivery
   - Progress tracking

5. **Job Board Enhancement** (`/api/jobs/*` - extend)
   - Visa sponsorship filter
   - Salary data integration
   - Company insights (reviews, ratings)
   - Matching score algorithm

6. **ATS Scanner** (`/api/skills/resume-builder/scan-ats`)
   - Parse resume for ATS compatibility
   - Extract keywords
   - Suggest improvements
   - Return compliance report

7. **Resume Translator** (`/api/skills/resume-builder/translate`)
   - Multi-language support (English, French, Portuguese, Arabic, Swahili)
   - Maintain formatting across languages
   - Export options

**Database Schema Additions (Prisma):**
```prisma
// Resume versions and history
model ResumVersion {
  id String @id @default(cuid())
  candidateId String
  originalContent String
  optimizedContent String
  atsScore Float
  matchScore Float @default(0.0)
  targetJobId String?
  createdAt DateTime @default(now())
  candidate Candidate @relation(fields: [candidateId], references: [id])
}

// Cover letter versions
model CoverLetterVersion {
  id String @id @default(cuid())
  candidateId String
  jobId String
  content String
  generatedAt DateTime @default(now())
  candidate Candidate @relation(fields: [candidateId], references: [id])
}

// Auto-apply tracking
model AutoApplyBatch {
  id String @id @default(cuid())
  candidateId String
  jobsToApply Int
  jobsApplied Int @default(0)
  creditsUsed Int
  status String // "queued", "in_progress", "completed", "failed"
  startedAt DateTime?
  completedAt DateTime?
  candidate Candidate @relation(fields: [candidateId], references: [id])
}

// Interview practice sessions
model InterviewSession {
  id String @id @default(cuid())
  candidateId String
  role String // Software Engineer, Data Analyst, etc.
  difficulty String // easy, medium, hard
  questions Json[] // Stored as JSON
  answers Json[] // Candidate responses
  feedbackScore Float
  createdAt DateTime @default(now())
  candidate Candidate @relation(fields: [candidateId], references: [id])
}
```

**API Response Format (Standardized):**
```typescript
interface SkillResponse<T> {
  success: boolean
  data?: T
  error?: string
  metadata?: {
    matchScore?: number
    atsScore?: number
    processingTime?: number
    model?: string // "claude-3.5-sonnet" or "gpt-5.4"
  }
}
```

---

### 3. FRONTEND ARCHITECT AGENT
**Role:** Build UI components, pages, user flows

**Features to Build:**

1. **Resume Builder Page** (`frontend/src/app/tools/resume-builder/`)
   - Multi-step form (contact info → experience → education → skills)
   - Live preview pane (like AIApply)
   - Template selector (3-5 styles)
   - AI optimization button
   - Export (PDF, Word)
   - Version history

2. **Cover Letter Generator** (`frontend/src/app/tools/cover-letter-generator/`)
   - Job description input
   - AI generation
   - Editing interface
   - One-click download

3. **Job Dashboard** (`frontend/src/app/dashboard/jobs/`)
   - Advanced filters (visa sponsorship, salary range, location, skills)
   - Auto-apply integration
   - Application status tracking
   - One-click apply or auto-apply

4. **Interview Prep Interface** (`frontend/src/app/tools/interview-prep/`)
   - Question selection by role
   - Live video recording (optional)
   - AI feedback delivery
   - Progress metrics

5. **Application Tracker** (`frontend/src/app/applications/`)
   - Timeline of applications
   - Status indicators
   - Interview scheduling
   - Notes and follow-ups

6. **Salary Data Visualizer** (`frontend/src/app/insights/salary/`)
   - Role-based salary ranges
   - Geographic comparisons (across African markets)
   - Currency conversion
   - Negotiation guidance

7. **Company Insights** (`frontend/src/app/companies/[id]/insights/`)
   - Reviews (crowdsourced)
   - Interview difficulty
   - Hiring timeline
   - Success stories

**Component Architecture:**
```typescript
// Shared UI components
frontend/src/components/
├── Resume/
│   ├── ResumeEditor.tsx
│   ├── ResumePreview.tsx
│   ├── TemplateSelector.tsx
│   └── VersionHistory.tsx
├── CoverLetter/
│   ├── CoverLetterGenerator.tsx
│   ├── CoverLetterEditor.tsx
│   └── CoverLetterTemplates.tsx
├── JobBoard/
│   ├── JobFilters.tsx
│   ├── JobCard.tsx
│   ├── JobDetailModal.tsx
│   └── ApplyButton.tsx
├── Interview/
│   ├── MockInterviewPanel.tsx
│   ├── QuestionDisplay.tsx
│   ├── AnswerEvaluator.tsx
│   └── FeedbackReport.tsx
├── Shared/
│   ├── MatchScoreDisplay.tsx
│   ├── ATSScoreDisplay.tsx
│   ├── SocialProof.tsx (testimonials, user count)
│   └── LoadingState.tsx
```

**Styling Approach:**
- Use existing component library (Tailwind + shadcn/ui pattern)
- Match AIApply's clean, modern aesthetic
- Gradient backgrounds for hero sections
- Card-based layouts
- Accessible color contrast

---

### 4. AI INTEGRATION AGENT
**Role:** Manage LLM APIs, prompt engineering, quality control

**API Integrations:**

1. **Anthropic Claude API** (Primary)
   - Resume optimization prompts
   - Cover letter generation
   - Interview question generation
   - Career advice
   - Model: `claude-3.5-sonnet` (default)

2. **GPT-5.4** (Secondary/Premium)
   - Advanced interview scoring
   - Complex job matching
   - Multi-document analysis
   - Model switching based on task complexity

**Prompt Library** (`backend/src/lib/ai/prompts/`):
```typescript
// Resume optimization
const RESUME_OPTIMIZE_PROMPT = `
You are an ATS expert and resume optimizer. Analyze this resume and job description.
Provide an optimized version with:
1. Keyword alignment with job requirements
2. Better action verbs
3. Quantifiable metrics
4. ATS-friendly formatting

Resume: {resume}
Job Description: {jobDesc}

Return valid JSON with structure: { optimized_resume, ats_score, match_score, suggestions }
`

// Cover letter generation
const COVER_LETTER_PROMPT = `
Generate a personalized cover letter that:
1. Addresses key job requirements
2. Highlights relevant achievements
3. Shows cultural fit
4. Has compelling call-to-action

Candidate Profile: {profile}
Job Description: {jobDesc}
Tone: {tone}

Return valid JSON with: { cover_letter, tone_matched }
`

// Interview question generation
const INTERVIEW_QUESTION_PROMPT = `
Generate 5 interview questions for a {role} position at a {company_type} company.
Include: 2 behavioral, 2 technical, 1 situational
Consider {difficulty} difficulty level.

Return JSON array of questions with: { question, expected_answer_points, difficulty }
`
```

**Response Processing:**
```typescript
interface AIResponse {
  success: boolean
  result: string | object
  tokensUsed: { input: number; output: number }
  model: string
  processingTime: number
  fallback?: boolean // true if GPT-5.4 failed, used Claude
}
```

**Error Handling:**
- Retry logic with exponential backoff
- Fallback from GPT-5.4 to Claude
- User-friendly error messages
- Logging for analysis

**Cost Optimization:**
- Cache common prompts (job descriptions, role templates)
- Batch processing where possible
- Rate limiting per user tier
- Usage analytics dashboard

---

### 5. INFRASTRUCTURE AGENT
**Role:** AWS setup, Terraform updates, environment configuration

**Infrastructure Additions:**

1. **Database Extensions (RDS PostgreSQL)**
   - New Prisma migration file for resume/cover letter/interview tables
   - Index optimization for fast queries
   - Backup strategy

2. **Environment Variables**
   ```bash
   # API Keys
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...

   # Feature Flags
   ENABLE_AUTO_APPLY=true
   ENABLE_INTERVIEW_PREP=true
   ENABLE_SALARY_NEGOTIATION=true
   ENABLE_AI_COACHING=true

   # Thresholds
   ATS_SCORE_THRESHOLD=0.75
   JOB_MATCH_THRESHOLD=0.65

   # Credits System
   AUTO_APPLY_CREDIT_COST=1
   RESUME_GENERATION_LIMIT=5_per_month_free
   ```

3. **Secrets Management (AWS Secrets Manager)**
   - Rotation policies
   - Access logging
   - Audit trail

4. **CloudWatch Monitoring**
   - API latency metrics
   - AI API success rates
   - Error rate monitoring
   - Cost tracking by feature

5. **CI/CD Pipeline Updates** (`.github/workflows/`)
   - Add Prisma migration validation step
   - API route smoke tests
   - Frontend component tests
   - Load testing for new endpoints

---

### 6. DATABASE AGENT
**Role:** Schema design, migrations, data integrity

**Migration Strategy:**

1. **Step 1:** Create new tables (resume, cover letter, interview, applications enhancement)
2. **Step 2:** Add indices for query performance
3. **Step 3:** Create seed data (templates, example questions)
4. **Step 4:** Add constraints (foreign keys, unique constraints)

**Migration Command:**
```bash
cd backend
npx prisma migrate dev --name "add_resume_cover_letter_tables"
npx prisma generate
npx prisma db push
```

**Seed Data** (`backend/prisma/seed.ts`):
- Resume templates (3-5 styles)
- Interview question bank (by role and difficulty)
- Company insights sample data
- Salary data (African markets)

---

### 7. QA/REVIEWER AGENT
**Role:** Test everything before deployment, validate integration

**Testing Checklist:**

**Unit Tests:**
- [ ] All new API endpoints return correct response format
- [ ] Prisma migrations succeed without errors
- [ ] AI prompt generation produces valid JSON
- [ ] Error handling works (bad input, API failures)

**Integration Tests:**
- [ ] Resume generation end-to-end
- [ ] Cover letter generation with different inputs
- [ ] Auto-apply flow (batching, credit deduction)
- [ ] Interview session creation and completion
- [ ] Job filtering with multiple criteria

**API Route Testing:**
```bash
# Test resume builder
curl -X POST http://localhost:4000/api/skills/resume-builder/generate \
  -H "Content-Type: application/json" \
  -d '{"resume": "...", "jobDescription": "..."}'

# Test auto-apply
curl -X POST http://localhost:4000/api/autopilot/batch \
  -H "Authorization: Bearer TOKEN" \
  -d '{"jobFilters": {...}, "count": 10}'

# Test interview prep
curl -X POST http://localhost:4000/api/mock-interviews/generate \
  -d '{"role": "Software Engineer", "difficulty": "medium"}'
```

**Frontend Testing:**
- [ ] Components render without errors
- [ ] Forms submit with correct data structure
- [ ] API calls are made with correct parameters
- [ ] Loading states work
- [ ] Error messages display properly
- [ ] Responsive design on mobile/tablet/desktop

**Performance Testing:**
- [ ] Resume generation completes in <5 seconds
- [ ] Job board loads in <2 seconds
- [ ] Auto-apply processes 100 jobs in <60 seconds
- [ ] No N+1 queries in database

**Security Testing:**
- [ ] API endpoints require authentication (except public)
- [ ] Users can't access other users' data
- [ ] Rate limiting works
- [ ] SQL injection prevention (Prisma handles)
- [ ] XSS prevention in resume display

**Test Report Template:**
```markdown
## QA Report: [Feature Name]

### ✅ Passing Tests
- Resume generation with valid input: PASS
- Cover letter for multiple job types: PASS

### ❌ Failed Tests
- (None)

### ⚠️  Warnings
- Auto-apply batch processing takes 45 seconds for 100 jobs (monitor at scale)

### 🔍 Security Check
- All endpoints properly authenticated: YES
- Rate limiting in place: YES
- No sensitive data in logs: YES

### 📊 Performance Metrics
- Average resume generation time: 3.2s
- Database query performance: Optimized with indices
- API response times: <500ms for non-AI endpoints

### 👍 Ready for Deployment
YES - All critical tests passing, performance acceptable, security verified.
```

---

## PART 3: WORKFLOW & IMPLEMENTATION PHASES

### PHASE 1: Foundation (Weeks 1-2)
**Goal:** Set up infrastructure and core APIs

**Orchestrator Tasks:**
1. [ ] Approve schema additions with DATABASE AGENT
2. [ ] Coordinate route structure with BACKEND ARCHITECT
3. [ ] Approve component architecture with FRONTEND ARCHITECT
4. [ ] Verify environment variables with INFRASTRUCTURE AGENT

**Backend Architect:**
1. [ ] Create Prisma schema additions
2. [ ] Create database migration
3. [ ] Build `/api/skills/resume-builder/generate` endpoint
4. [ ] Build `/api/skills/application-writer/generate-letter` endpoint
5. [ ] Extend `/api/autopilot/*` routes
6. [ ] Add credential-based billing integration

**AI Integration Agent:**
1. [ ] Set up Claude API client
2. [ ] Set up GPT-5.4 client with fallback
3. [ ] Create prompt library
4. [ ] Test all prompts in isolation

**Infrastructure Agent:**
1. [ ] Update `.env.example` with new variables
2. [ ] Create Secrets Manager policies
3. [ ] Update CloudWatch dashboards
4. [ ] Add CI/CD pipeline steps for migrations

**Frontend Architect:**
1. [ ] Create page structure (`/tools/*`)
2. [ ] Create base UI components
3. [ ] Set up API client hooks

**Database Agent:**
1. [ ] Generate Prisma migration
2. [ ] Create seed data
3. [ ] Verify migration runs cleanly

**QA Agent:**
1. [ ] Create test suite for endpoints
2. [ ] Run integration tests
3. [ ] Performance baseline

---

### PHASE 2: Core Features (Weeks 3-4)
**Goal:** Implement all AIApply-inspired features

**Resume Builder:**
- Template system with 5 styles
- Live preview
- AI optimization
- ATS scanning
- Multi-version management

**Cover Letter Generator:**
- Job-specific generation
- Tone adjustment
- Version tracking
- Export options

**Auto-Apply Service:**
- Smart job matching (not just keyword matching)
- Batch processing
- Credit system
- Application tracking
- Status updates

**Interview Prep:**
- Role-specific questions
- Difficulty levels
- AI scoring
- Feedback delivery
- Progress tracking

**Job Board Enhancement:**
- Visa sponsorship filter
- Salary data visualization
- Company insights
- Match scoring

---

### PHASE 3: African Features (Weeks 5-6)
**Goal:** Implement continent-specific differentiators

**Career Gap Assistant:**
- Detect gaps in resume
- Generate explanations
- Frame positively

**Multi-language Support:**
- Translate resumes (English, French, Portuguese, Arabic, Swahili)
- Maintain ATS compatibility

**Salary Negotiation:**
- Currency-aware comparisons
- Market data by country
- Negotiation tips

**Company Insights:**
- Crowdsourced reviews
- Interview difficulty ratings
- Hiring timeline data

**Community Features:**
- Forums/discussions
- Success story showcase
- Peer groups

---

### PHASE 4: Testing & Deployment (Week 7)
**Goal:** Full validation and production readiness

**QA Agent:**
1. [ ] Run full test suite
2. [ ] Performance testing under load
3. [ ] Security audit
4. [ ] Accessibility check
5. [ ] Create final QA report

**Orchestrator:**
1. [ ] Review QA report
2. [ ] Get thumbs-up from QA
3. [ ] Coordinate deployment bundles
4. [ ] Update `STAGING_RUNBOOK.md`

**Infrastructure Agent:**
1. [ ] Deploy migrations to staging
2. [ ] Run smoke tests
3. [ ] Verify all endpoints working
4. [ ] Update Terraform state

**Deployment:**
1. [ ] PR to `develop` branch
2. [ ] CI passes all checks
3. [ ] Deploy to staging
4. [ ] Final validation
5. [ ] Ready for production

---

## PART 4: ORCHESTRATOR DECISION FRAMEWORK

### When Making Decisions, Use This Matrix:

**Question 1: Does this feature already exist in the codebase?**
- YES → Extend it (don't duplicate)
- NO → Create new route/component

**Question 2: Does it require database changes?**
- YES → Coordinate with DATABASE AGENT first
- NO → Proceed with API/UI

**Question 3: Does it need AI/LLM?**
- YES → Route to AI INTEGRATION AGENT
- NO → Pure backend/frontend work

**Question 4: Does it require AWS/infra changes?**
- YES → Involve INFRASTRUCTURE AGENT
- NO → Proceed

**Question 5: Any conflicts with existing code?**
- YES → Resolve before proceeding
- NO → Proceed

---

## PART 5: CRITICAL RULES FOR ALL AGENTS

### Rule 1: Check Existing Routes First
Before creating a new route, check `backend/src/routes/` for existing implementations.

### Rule 2: Follow File Naming Conventions
- Routes: `backend/src/routes/feature-name.ts`
- Components: `frontend/src/components/FeatureName.tsx` (PascalCase)
- Utilities: `backend/src/lib/feature-name/` (kebab-case)
- Tests: `backend/src/__tests__/feature-name.test.ts`

### Rule 3: Use Environment Variables for Configuration
Don't hardcode API keys, models, thresholds. Use `process.env.*`

### Rule 4: Type Everything (TypeScript)
All backend code must have proper types. No `any`.

### Rule 5: Test Before Committing
Run linting, type checking, and tests locally:
```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
```

### Rule 6: Document API Changes
Update API docs when adding/modifying endpoints (Swagger/OpenAPI)

### Rule 7: Update STAGING_RUNBOOK.md After Changes
After any material change, update the runbook with new URLs, routes, environment variables

### Rule 8: No Breaking Changes Without Plan
If modifying existing schema/routes, get ORCHESTRATOR approval first

### Rule 9: Keep Commits Atomic
Each commit should be one logical unit (schema change, endpoint, or component, not all three)

### Rule 10: Validate Against Existing Tests
Ensure new code doesn't break existing tests. Run full suite:
```bash
cd backend && npm test
cd frontend && npm run test:unit:ci
```

---

## PART 6: DEPLOYMENT USING AFRITALENT SKILL

Once QA approves, use the `afritalent-operator` skill to deploy:

```bash
# Orchestrator triggers deployment
# Using: .codex/skills/afritalent-operator/SKILL.md

# Steps:
1. Verify all tests passing in GitHub Actions
2. Merge PR to `develop` branch
3. Trigger: `npm run deploy:staging` via skill
4. Verify endpoints alive: `/api/health`, `/health`
5. Run smoke tests
6. Update STAGING_RUNBOOK.md
7. Get approval for prod deployment if needed
```

---

## PART 7: SUCCESS CRITERIA

**Project Complete When:**

- [ ] All 7 core features implemented (Resume, Cover Letter, Auto-Apply, Interview Prep, Job Board, ATS Scanner, Translator)
- [ ] All African differentiators added (Visa filter, Salary data, Gap assistant, Multi-language, Company insights, Community)
- [ ] 100% test coverage for critical paths
- [ ] Performance benchmarks met (<5s resume generation, <2s job board load)
- [ ] Security audit passed
- [ ] Deployed to staging, all smoke tests passing
- [ ] STAGING_RUNBOOK.md updated with new routes and URLs
- [ ] Documentation complete (API docs, deployment guide)
- [ ] QA Agent gives final thumbs-up

---

## PART 8: COMMUNICATION PROTOCOL

### Orchestrator ↔ Agents
- **Status updates:** Daily standup in code comments
- **Blockers:** Immediately escalate with context
- **Decisions:** Document in `docs/plans/` directory
- **Approvals:** Explicit checkoff required before proceeding

### Agent ↔ Agent
- **Dependencies:** Flag as comments in code
- **Conflicts:** Escalate to ORCHESTRATOR
- **Questions:** Ask ORCHESTRATOR, not each other

### All Agents ↔ Git
- Create feature branches: `feature/resume-builder`, `feature/auto-apply`
- Commit frequently: Small, atomic commits
- PR early and often for feedback
- Request ORCHESTRATOR review before merge

---

## PART 9: ORCHESTRATOR STARTUP CHECKLIST

When beginning, ORCHESTRATOR must:

```bash
# 1. Validate codebase health
cd /sessions/wizardly-loving-mccarthy/mnt/afri-tech
git status
git log --oneline -10

# 2. Check all existing tests pass
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build

# 3. Review critical docs
cat STAGING_RUNBOOK.md # Current live state
cat AGENTS.md # Repo conventions
cat AGENT_BOOTSTRAP.md # Context

# 4. List existing routes to prevent duplication
ls -la backend/src/routes/

# 5. Inspect Prisma schema
cat backend/prisma/schema.prisma | grep -E "^model " # List tables

# 6. Set up agent tracking
# Create: docs/plans/[DATE]-afrapply-implementation-plan.md
# With sections: Foundation, Features, Testing, Deployment, Success Criteria
```

---

## PART 10: RISK MITIGATION

### Risk 1: API Rate Limits (Claude + GPT-5.4)
**Mitigation:**
- Implement request queuing
- Cache results
- Graceful degradation
- User-facing rate limit info

### Risk 2: Database Migration Failures
**Mitigation:**
- Test migrations on staging first
- Keep rollback scripts ready
- Backup before each migration
- Test with production-like data volume

### Risk 3: Frontend Performance (Many new features)
**Mitigation:**
- Code splitting per feature
- Lazy loading components
- Image optimization
- Regular Lighthouse audits

### Risk 4: Cost Overruns (AI API calls)
**Mitigation:**
- Implement usage quotas
- Monitor costs daily
- Optimize prompts for efficiency
- Cache common requests

### Risk 5: Security Vulnerabilities (User data at scale)
**Mitigation:**
- Security audit before deployment
- OWASP top 10 review
- Penetration testing
- Rate limiting on sensitive endpoints

---

## FINAL NOTES

This orchestration system is designed to:
1. **Maximize parallelization** (agents work simultaneously on different features)
2. **Minimize merge conflicts** (clear responsibility boundaries)
3. **Ensure quality** (QA gatekeeper before deployment)
4. **Maintain stability** (no breaking changes without plan)
5. **Enable scale** (foundation for continuous feature additions)

The ORCHESTRATOR is the intelligent coordinator who understands the codebase deeply and can make architectural decisions quickly. The QA AGENT ensures nothing breaks. Together, this team can ship production-grade features in weeks, not months.

---

**Document Version:** 1.0
**Last Updated:** April 9, 2026
**Next Review:** After Phase 1 completion
**Contact:** CTO/Lead Architect (for clarifications)
