# AfriTalent AIApply Implementation Orchestration Plan

**Date:** April 9, 2026
**Orchestrator:** Claude Orchestrator Agent
**Status:** Planning Phase - Ready for Agent Approval
**Codebase Location:** `/sessions/wizardly-loving-mccarthy/mnt/afri-tech`

---

## EXECUTIVE SUMMARY

This orchestration plan breaks down the AIAPPLY_ANALYSIS.md recommendations into 4 concurrent/sequential phases, distributes work across 6 specialized agents, manages schema-first dependencies, and tracks progress through to production deployment.

**Core Strategy:**
1. **Database Agent** creates all schema models first (BLOCKING: all others)
2. **AI Integration Agent** sets up API clients in parallel (needed for feature routes)
3. **Infrastructure Agent** provisions environments and secrets (deployment enabler)
4. **Backend & Frontend Architects** build routes and pages after database ready
5. **QA Agent** validates everything end-to-end before staging deployment
6. **Orchestrator** coordinates handoffs, resolves conflicts, updates STAGING_RUNBOOK.md

**Target Timeline:** 7 weeks (2 weeks foundation, 4 weeks features, 1 week QA/deploy)

---

## CURRENT STATE INVENTORY

### Existing Backend Routes
Routes already in place (location: `/backend/src/routes/`):
- `admin.ts`, `admin-*.ts` - Admin/system routes
- `auth.ts` - Authentication
- `autopilot.ts` - Auto-apply feature (needs enhancement)
- `jobs.ts` - Job board (needs AI enhancement)
- `applications.ts` - Job applications
- `ats.ts` - ATS scanning
- `billing.ts` - Payment processing
- `chat.ts` - Messaging
- `companies.ts` - Company data
- `interview-experiences.ts` - Interview database

### Existing Skills Routes (NEW)
Routes in `/backend/src/routes/skills/`:
- `resume-builder.ts` - Resume generation (EXISTS - needs validation)
- `application-writer.ts` - Cover letter generation (EXISTS - needs validation)
- `job-matcher.ts` - Job matching logic (EXISTS - needs validation)
- `career-advisor.ts` - Career guidance (EXISTS - needs validation)

### Existing Prisma Models
Key models already in schema:
- `User`, `Employer`, `CandidateProfile` - Users & profiles
- `Job`, `Application` - Job and application tracking
- `UserResume`, `CandidateResumeVersion` - Resume versioning
- `Resume` - Resume data
- `CandidateAutopilotProfile`, `CandidateAgentTask` - Autopilot infrastructure
- `Notification`, `NotificationPreference` - Notification system
- `MessageThread`, `Message` - Messaging
- `Company` - Company data
- Various trust, billing, and verification models

### Existing Frontend Pages
Pages already exist in `/frontend/src/app/`:
- `/candidate/*` - Candidate dashboard
- `/employer/*` - Employer portal
- `/jobs/*` - Job listing
- `/admin/*` - Admin panel
- `/auth/*` - Authentication flows
- etc.

**KEY INSIGHT:** Much of the infrastructure is already in place. This plan focuses on:
1. Validating and extending existing routes
2. Adding missing schema models for new features
3. Building new pages for AIApply features not yet fully implemented
4. Coordinating AI integration across all features

---

## PHASE 1: FOUNDATION (Week 1-2)

### Goal
- Validate and extend database schema for all 7 AIApply features
- Set up AI API clients with proper error handling and fallback logic
- Configure environment variables and infrastructure for AI integration
- Document existing code dependencies

### 1.1 DATABASE AGENT: Validate & Extend Schema

**Status:** BLOCKING all other work

**Tasks:**

1. **Audit existing models** (2 hours)
   - Review all 40+ existing models in schema
   - Document what's already there for resume/application features
   - Identify gaps for new AIApply features

2. **Create missing schema models** (4 hours)
   - `ResumeOptimizationVersion` - Track AI-optimized resume versions
     - Fields: `id`, `resumeId`, `optimizationStrategy`, `atsScore`, `matchScore`, `generatedAt`, `createdAt`
   - `CoverLetterVersion` - Track generated cover letters
     - Fields: `id`, `candidateId`, `jobId`, `content`, `tone`, `generatedAt`, `createdAt`, `updatedAt`
   - `AutoApplyBatch` - Track bulk auto-apply operations
     - Fields: `id`, `candidateId`, `batchName`, `targetCount`, `appliedCount`, `failedCount`, `status` (QUEUED|RUNNING|SUCCESS|PARTIAL_FAILURE), `creditsUsed`, `startedAt`, `completedAt`, `createdAt`
   - `InterviewSession` - Track mock interview sessions
     - Fields: `id`, `candidateId`, `jobId`, `role`, `difficulty`, `questions` (JSON), `answers` (JSON), `feedbackScore`, `sessionStatus` (IN_PROGRESS|COMPLETED|ABANDONED), `recordingUrl`, `createdAt`, `completedAt`
   - `ATSReport` - Track ATS scan results
     - Fields: `id`, `resumeId`, `score` (0-100), `missingKeywords` (JSON), `formattingIssues` (JSON), `suggestions` (JSON), `createdAt`
   - `SalaryBenchmark` - Track salary data by role/location
     - Fields: `id`, `role`, `location`, `country`, `currency`, `minSalary`, `medianSalary`, `maxSalary`, `dataSource`, `lastUpdated`
   - `JobMatchScore` - Cache job-candidate match scores
     - Fields: `id`, `candidateId`, `jobId`, `matchScore`, `matchReason` (JSON), `visaSponsorshipMatch`, `salaryMatch`, `cachedAt`, `expiresAt`

3. **Add relations & indices** (3 hours)
   - Add foreign keys connecting new models to existing `User`, `Job`, `Application`
   - Create indices on:
     - `candidateId`, `createdAt` (for fast filtering)
     - `jobId`, `applicationId` (for result lookups)
     - `status`, `completedAt` (for batch tracking)
     - `expiresAt` (for cache cleanup)
   - Add composite indices for common query patterns (e.g., `candidateId + createdAt DESC`)

4. **Create migration file** (1 hour)
   - Run `npx prisma migrate dev --name add_aiapply_features`
   - Validate migration compiles without errors
   - Test rollback/forward safely in local environment
   - Generate SQL and review for performance

5. **Seed development data** (2 hours)
   - Create seed script: `/backend/prisma/seed-aiapply-data.ts`
   - Populate with:
     - 50 resume templates/examples
     - 100 salary benchmarks (Nigeria, Kenya, South Africa, Egypt, Ghana)
     - 20 interview question banks by role
     - Sample batch and session records
   - Run `npx prisma db seed`

**Deliverable:**
- `backend/prisma/schema.prisma` updated with 7 new models
- `backend/prisma/migrations/[timestamp]_add_aiapply_features.sql` created and tested
- `backend/prisma/seed-aiapply-data.ts` implemented
- Schema validation passes: `npm run typecheck` + `npm test` in backend

**Success Criteria:**
- All new models compile without TypeScript errors
- Foreign key relationships are valid
- Migration applies cleanly to a fresh database
- Seed data loads without errors
- `npx prisma studio` shows all new models

**Blocking:**
- All Backend/Frontend/AI Integration work depends on this

**Dependencies:** None (start immediately)

---

### 1.2 AI INTEGRATION AGENT: Setup API Clients

**Status:** PARALLEL with Database Agent

**Tasks:**

1. **Create Anthropic client module** (2 hours)
   - File: `backend/src/lib/ai/anthropic-client.ts`
   - Implement:
     - `initializeAnthropicClient()` - Connect to Anthropic API with error handling
     - `generateResumeOptimization(resume, jobDescription)` - Call Claude for resume enhancement
     - `generateCoverLetter(profile, jobDescription)` - Generate personalized cover letters
     - `generateInterviewQuestions(role, difficulty)` - Generate mock interview questions
     - `evaluateInterviewAnswer(question, answer, context)` - Provide feedback on answers
     - `extractSalaryInsights(role, location)` - Generate salary negotiation guidance
     - Retry logic with exponential backoff
     - Token usage tracking and logging
     - Rate limiting (max 100 req/min)
     - Error recovery with fallback responses

2. **Create OpenAI/GPT fallback client** (2 hours)
   - File: `backend/src/lib/ai/openai-client.ts`
   - Same interface as Anthropic (for easy swapping)
   - Implement GPT-5.4 as primary with fallback to GPT-4
   - Used for cost optimization on high-volume operations

3. **Create response validator** (1 hour)
   - File: `backend/src/lib/ai/response-validator.ts`
   - Validate AI responses for:
     - JSON parsing errors
     - Missing required fields
     - Token limit exceeded
     - Content policy violations
   - Return standardized error objects

4. **Create AI routing logic** (1 hour)
   - File: `backend/src/lib/ai/router.ts`
   - Route requests based on:
     - Operation type (resume vs interview vs salary)
     - Token budget remaining
     - API availability
     - Cost optimization rules
   - Example: Use Anthropic for resume (higher quality), GPT for interviews (faster)

5. **Setup environment variables** (1 hour)
   - Create/update `.env.example` with:
     - `ANTHROPIC_API_KEY`
     - `OPENAI_API_KEY`
     - `AI_REQUEST_TIMEOUT_MS`
     - `AI_MAX_TOKENS_PER_MONTH`
     - `AI_FALLBACK_ENABLED`
     - `AI_COST_TRACKING_ENABLED`
   - Document each variable with description and example values

6. **Create cost tracking module** (1 hour)
   - File: `backend/src/lib/ai/cost-tracker.ts`
   - Track:
     - API calls per feature per day
     - Token usage per model
     - Estimated cost (Anthropic vs OpenAI vs GPT)
     - Daily/monthly budget alerts
   - Store metrics in Redis for real-time queries

**Deliverable:**
- `backend/src/lib/ai/anthropic-client.ts` with full implementation
- `backend/src/lib/ai/openai-client.ts` with GPT implementation
- `backend/src/lib/ai/response-validator.ts` with validation rules
- `backend/src/lib/ai/router.ts` with routing logic
- `backend/src/lib/ai/cost-tracker.ts` with metrics
- `backend/.env.example` updated with all AI variables
- Comprehensive error handling and fallback logic

**Success Criteria:**
- All modules export typed interfaces compatible with routes
- Error handling covers network, rate limit, and token limit scenarios
- Anthropic API responds successfully to test prompts
- Fallback routing works when primary API unavailable
- Cost tracking accumulates data correctly
- `npm run typecheck` passes with strict mode

**Blocking:**
- All routes that call AI APIs

**Dependencies:**
- Anthropic/OpenAI API keys already configured in Secrets Manager (from STAGING_RUNBOOK.md)

---

### 1.3 INFRASTRUCTURE AGENT: Setup Secrets & Environment

**Status:** PARALLEL with Database Agent

**Tasks:**

1. **Update Secrets Manager** (1 hour)
   - Verify existing secrets from STAGING_RUNBOOK.md:
     - `DATABASE_URL`
     - `JWT_SECRET`
     - `REDIS_URL`
     - `STRIPE_SECRET_KEY`
   - Add new secrets:
     - `ANTHROPIC_API_KEY` (confirm staging vs prod key)
     - `OPENAI_API_KEY`
     - `CLAUDE_API_KEY` (if different from Anthropic)
   - Document secret rotation policy

2. **Create environment variable schema** (1 hour)
   - File: `backend/config/env-schema.ts`
   - Define all env variables with TypeScript validation
   - Use `zod` for runtime validation
   - Validate on server startup
   - Export type-safe config object

3. **Update GitHub Actions secrets** (30 min)
   - Add to repo secrets:
     - `STAGING_ANTHROPIC_API_KEY`
     - `STAGING_OPENAI_API_KEY`
   - Document which secrets are used in which workflows

4. **Create CloudWatch dashboards** (2 hours)
   - Dashboard: "AIApply Feature Metrics"
   - Metrics to track:
     - AI API call count (by feature, by day)
     - API latency (p50, p95, p99)
     - Error rate (by type)
     - Token usage (by model)
     - Cost per feature
     - Queue depth (for batch operations)
   - Set alarms for:
     - Error rate > 5%
     - Latency p95 > 5 seconds
     - Cost exceeds daily budget by 20%

5. **Create Terraform plan for new resources** (2 hours)
   - File: `infra/terraform/ai-integration.tf`
   - Define:
     - IAM role for AI API access
     - CloudWatch log groups for AI operations
     - SNS topic for API alerts
     - Cost anomaly detection
   - Do NOT apply yet - just document the plan
   - Review with team before application

6. **Document AI integration in runbook** (1 hour)
   - Add section to STAGING_RUNBOOK.md:
     - AI API health checks
     - Fallback behavior documentation
     - Cost monitoring procedure
     - Emergency API shutdown procedure

**Deliverable:**
- `backend/config/env-schema.ts` with validation
- Updated Secrets Manager with AI keys
- Updated `.env.example` with all variables
- CloudWatch dashboard created
- `infra/terraform/ai-integration.tf` (planned, not applied)
- Updated STAGING_RUNBOOK.md with AI section

**Success Criteria:**
- All environment variables load without errors on startup
- Secrets Manager returns values correctly
- CloudWatch dashboard displays real data
- Terraform plan shows no errors
- Documentation is clear and complete

**Blocking:**
- None (can start in parallel)

**Dependencies:** None

---

## PHASE 2: CORE FEATURES (Week 3-4)

### Goal
- Implement and integrate 7 core AIApply features
- Build new frontend pages for features not yet UI-complete
- Connect all features to AI APIs
- Validate end-to-end workflows

### 2.1 RESUME BUILDER & OPTIMIZATION

**Backend Architect: Enhance Routes**

**Status:** Starts after database ready

**Current State:**
- Route exists: `backend/src/routes/skills/resume-builder.ts`
- Already has endpoints for resume generation
- DECISION: EXTEND existing route, do not duplicate

**Tasks:**

1. **Validate existing resume-builder.ts** (2 hours)
   - Read and understand current implementation
   - Identify what's already done vs. what needs enhancement
   - Document gaps

2. **Add resume optimization endpoint** (3 hours)
   - Endpoint: `POST /api/skills/resume-builder/optimize`
   - Parameters:
     - `resumeId` - which resume to optimize
     - `jobDescription` - optional job to optimize against
     - `optimizationStrategy` - "ats" | "keyword" | "formatting" | "impact"
   - Call Anthropic client to generate optimized version
   - Save as new `ResumeOptimizationVersion`
   - Return optimized text + analysis

3. **Add ATS scanning endpoint** (2 hours)
   - Endpoint: `POST /api/skills/resume-builder/scan-ats`
   - Parameters: `resumeId`, optional `jobId` for keyword matching
   - Call existing ATS logic (from `routes/ats.ts`)
   - Return detailed `ATSReport` (score, missing keywords, suggestions)
   - Cache results for 24 hours via `JobMatchScore`

4. **Add version management** (2 hours)
   - Endpoint: `GET /api/skills/resume-builder/versions/:candidateId`
   - Return all `UserResume` + `CandidateResumeVersion` + `ResumeOptimizationVersion`
   - Include metadata: created date, last modified, ATS score, optimization status
   - Endpoint: `GET /api/skills/resume-builder/:resumeId/versions`
   - Show version history with diffs

5. **Add template selection** (1 hour)
   - Endpoint: `POST /api/skills/resume-builder/apply-template`
   - Parameters: `resumeId`, `templateStyle` ("Harvard" | "Modern" | "Minimal" | "ATS")
   - Update resume formatting using template rules
   - Store template choice in metadata

6. **Add export functionality** (2 hours)
   - Endpoint: `GET /api/skills/resume-builder/:resumeId/export`
   - Query params: `format` ("pdf" | "docx" | "txt")
   - Use existing document generation library (or add if missing)
   - Return downloadable file

7. **Add comprehensive error handling & logging** (2 hours)
   - Log all AI API calls with parameters and results
   - Validate inputs (resume text length, jobDescription format)
   - Return proper error messages (not raw API errors)
   - Test with invalid inputs

**Deliverable:**
- Enhanced `backend/src/routes/skills/resume-builder.ts` with 6+ endpoints
- `ResumeOptimizationVersion` model used and stored
- Full error handling and logging
- Integration with Anthropic client for optimization
- API documentation updated

**Success Criteria:**
- All 6 new endpoints return valid JSON responses
- Optimization produces meaningful improvements to resume
- ATS score correlates with actual test results
- Export produces readable PDFs/documents
- Error messages are helpful and not verbose
- Latency < 3 seconds for optimization (excluding AI time)
- `npm test` passes for resume routes

**Frontend Architect: Build Resume Page**

**Status:** Starts after backend endpoints ready

**Current State:**
- Page likely exists in `/frontend/src/app/candidate/tools/`
- DECISION: Check if page exists, enhance if needed, create if missing

**Tasks:**

1. **Create/verify Resume Builder page** (3 hours)
   - File: `/frontend/src/app/candidate/tools/resume-builder/page.tsx`
   - Layout: Split-pane (editor left, preview right)
   - Responsive: Stack on mobile

2. **Build EditorPane component** (3 hours)
   - File: `/frontend/src/components/resume/EditorPane.tsx`
   - Features:
     - Text input for each resume section (summary, experience, skills, education)
     - Rich text formatting (bold, italic, bullet points)
     - Auto-save to backend every 5 seconds
     - Undo/redo functionality
     - Section add/delete buttons
   - Validation: Show warnings for ATS issues in real-time

3. **Build PreviewPane component** (3 hours)
   - File: `/frontend/src/components/resume/PreviewPane.tsx`
   - Show live preview as user types
   - Template selector dropdown (Harvard, Modern, Minimal, ATS)
   - Display ATS score (green if > 80, yellow if 60-80, red if < 60)
   - Show missing keywords in orange
   - Export button (PDF, DOCX, TXT)

4. **Build TemplateSelector component** (2 hours)
   - File: `/frontend/src/components/resume/TemplateSelector.tsx`
   - Show 4 template cards with screenshots
   - Click to apply template
   - Preview template before applying

5. **Build VersionHistory component** (2 hours)
   - File: `/frontend/src/components/resume/VersionHistory.tsx`
   - Table: Date Created | ATS Score | Optimizations | Actions
   - Actions: View, Download, Restore, Delete
   - Show diffs between versions

6. **Build OptimizeButton component** (1 hour)
   - File: `/frontend/src/components/resume/OptimizeButton.tsx`
   - Dropdown with options: ATS | Keyword | Formatting | Impact
   - Show loading state during optimization
   - Display before/after comparison
   - Accept/reject optimizations

7. **Build ATSScoreDisplay component** (1 hour)
   - File: `/frontend/src/components/resume/ATSScoreDisplay.tsx`
   - Large score indicator (0-100)
   - Color coding (green/yellow/red)
   - Tooltip with explanation
   - Link to detailed report

8. **Create useResumeBuilder hook** (2 hours)
   - File: `/frontend/src/hooks/useResumeBuilder.ts`
   - Manages state: resume content, selected template, optimization status
   - API calls: fetch resume, save changes, optimize, scan ATS, export
   - Error handling and retry logic
   - Loading states

9. **Write tests** (3 hours)
   - Unit tests for each component
   - Integration test: create → edit → optimize → export flow
   - Test accessibility (WCAG AA)
   - Test mobile responsiveness

**Deliverable:**
- Complete resume builder page with split pane layout
- 7 reusable components
- `useResumeBuilder` hook with full API integration
- Comprehensive test suite
- Mobile responsive

**Success Criteria:**
- Page loads in < 2 seconds
- Live preview updates within 300ms of typing
- Optimization completes in < 5 seconds
- Export produces readable PDFs
- All components render correctly on mobile
- Tests pass with > 80% coverage
- No console errors or warnings

**Testing (QA Agent prep):**
- Test: Create new resume from scratch
- Test: Import from LinkedIn
- Test: Optimize for specific job
- Test: Export to PDF
- Test: View version history
- Test: Restore previous version

---

### 2.2 COVER LETTER GENERATOR

**Backend Architect: Enhance Routes**

**Status:** Starts after database ready

**Current State:**
- Route exists: `backend/src/routes/skills/application-writer.ts`
- Already has cover letter generation
- DECISION: EXTEND existing route

**Tasks:**

1. **Validate existing application-writer.ts** (1 hour)
   - Understand current implementation
   - Identify what's done vs. what needs addition

2. **Add tone selector options** (2 hours)
   - Endpoint: `POST /api/skills/application-writer/generate-letter`
   - Parameters:
     - `candidateId`
     - `jobId` (to pull job description)
     - `tone` - "Professional" | "Friendly" | "Formal" | "Enthusiastic"
     - `length` - "Brief" | "Standard" | "Detailed"
   - Pass tone to Anthropic client
   - Generate letter matching tone

3. **Add letter versioning** (2 hours)
   - Save each generated letter as `CoverLetterVersion`
   - Endpoint: `GET /api/skills/application-writer/versions/:candidateId`
   - Show history of generated letters
   - Allow A/B testing (generate 2 versions, compare)

4. **Add personalization options** (2 hours)
   - Let users edit generated letter before saving
   - Endpoint: `PUT /api/skills/application-writer/:letterId`
   - Save edited version
   - Track edits vs. AI-generated

5. **Add export functionality** (1 hour)
   - Endpoint: `GET /api/skills/application-writer/:letterId/export`
   - Formats: PDF, DOCX, TXT
   - Add formatting (letterhead, date, recipient)

6. **Add validation & quality check** (1 hour)
   - Check letter length (300-500 words)
   - Validate company name matches job
   - Flag missing recipient information
   - Warn if tone doesn't match industry

**Deliverable:**
- Enhanced `backend/src/routes/skills/application-writer.ts`
- Full tone/personalization support
- Version history tracking
- Export in multiple formats
- Quality validation

**Success Criteria:**
- Generation completes in < 4 seconds
- Letters are unique per job
- Tone selection produces different outputs
- Export produces readable documents
- Validation catches quality issues
- `npm test` passes

**Frontend Architect: Build Cover Letter Page**

**Status:** Starts after backend endpoints ready

**Tasks:**

1. **Create Cover Letter Generator page** (3 hours)
   - File: `/frontend/src/app/candidate/tools/cover-letter-generator/page.tsx`
   - Layout: Form → Generated Output → Editor
   - Responsive design

2. **Build JobSelector component** (1 hour)
   - Search and select which job to write letter for
   - Show job title, company, key requirements
   - Auto-populate relevant context

3. **Build ToneSelector component** (1 hour)
   - Radio buttons or dropdown for tone selection
   - Show example of each tone
   - Real-time preview with tone applied

4. **Build LetterEditor component** (2 hours)
   - Display generated letter in rich text editor
   - Allow inline editing
   - Track changes from original
   - "Accept All" or manual tweaks

5. **Build LetterPreview component** (1 hour)
   - Show formatted letter as it would print
   - Include proper letterhead, date, recipient
   - Print-friendly styling

6. **Build VersionComparison component** (1 hour)
   - Side-by-side view of different generated versions
   - Highlight differences
   - Quick swap between versions

7. **Build ExportButton component** (1 hour)
   - Download as PDF, DOCX, or TXT
   - Show download progress

8. **Create useLetterGenerator hook** (1 hour)
   - State management for letter generation
   - API calls to backend
   - Error handling

9. **Write tests** (2 hours)
   - Unit tests for components
   - Integration test: select job → generate → edit → export
   - Accessibility tests

**Deliverable:**
- Complete cover letter page
- 6 components + hook
- Test suite

**Success Criteria:**
- Page loads quickly
- Generation completes in < 4 seconds
- Editing smooth and responsive
- Export works correctly
- Mobile responsive
- Tests pass

---

### 2.3 AUTO-APPLY SYSTEM ENHANCEMENT

**Backend Architect: Extend Autopilot Routes**

**Status:** Starts after database ready

**Current State:**
- Route exists: `backend/src/routes/autopilot.ts` (25KB)
- Already has basic auto-apply logic
- DECISION: EXTEND significantly

**Tasks:**

1. **Audit existing autopilot.ts** (2 hours)
   - Understand current workflow
   - Identify integration points with new features

2. **Add batch creation with AIApply features** (3 hours)
   - Endpoint: `POST /api/autopilot/batch`
   - Parameters:
     - `candidateId`
     - `criteria` - filters (role, location, salaryRange, visaSponsorship)
     - `targetCount` - how many jobs to apply for
     - `useOptimizedResume` - boolean
     - `generateCustomLetters` - boolean
   - Query database for matching jobs using `JobMatchScore` cache
   - Create `AutoApplyBatch` record

3. **Implement smart job matching** (4 hours)
   - Use `job-matcher.ts` to score candidate against jobs
   - Call Anthropic for role-specific fit analysis
   - Weight factors:
     - Skills match (40%)
     - Experience level (25%)
     - Salary compatibility (20%)
     - Visa sponsorship availability (10%)
     - Company culture fit (5%)
   - Filter jobs with match score > 70%
   - Sort by match score descending

4. **Implement batch application processing** (3 hours)
   - Endpoint: `POST /api/autopilot/batch/:batchId/apply`
   - For each job in batch:
     - Generate optimized resume if enabled
     - Generate cover letter with tone based on company
     - Submit application via existing routes/applications.ts
     - Track success/failure
   - Update `AutoApplyBatch` with results
   - Queue long operations (delay batch for heavy processes)

5. **Add real-time status tracking** (2 hours)
   - Endpoint: `GET /api/autopilot/batch/:batchId`
   - Return:
     - Batch metadata (name, created date, status)
     - Progress: appliedCount / targetCount
     - List of attempted jobs with status (Success, Failed, Pending)
     - Errors for failed applications
   - Support WebSocket updates (optional enhancement)

6. **Add credit system integration** (2 hours)
   - Each application deducts credits from user's subscription
   - Check available credits before batch
   - Deduct 1 credit per job application
   - Return error if insufficient credits
   - Document pricing (e.g., 100 jobs = 100 credits)

7. **Add failure recovery** (2 hours)
   - If application fails (network error, API error):
     - Retry up to 3 times with exponential backoff
     - Log detailed error
     - Allow manual retry later
   - Document common failure scenarios

8. **Add logging & analytics** (1 hour)
   - Log each batch to CloudWatch
   - Track metrics:
     - Batches created per day
     - Average success rate
     - Jobs applied to per batch
     - Credits used per batch
   - Enable cost tracking

**Deliverable:**
- Enhanced `backend/src/routes/autopilot.ts` with 5+ new endpoints
- Integration with job-matcher, resume-builder, application-writer
- `AutoApplyBatch` model fully utilized
- Credit system working
- Comprehensive logging

**Success Criteria:**
- Batch application completes 100 jobs in < 120 seconds
- Match scoring produces realistic results
- Resume/letter customization works correctly
- Credit deduction is accurate
- All errors logged properly
- Status tracking is real-time
- `npm test` passes for autopilot routes

**Frontend Architect: Build Auto-Apply Dashboard**

**Status:** Starts after backend endpoints ready

**Tasks:**

1. **Create Auto-Apply page** (3 hours)
   - File: `/frontend/src/app/candidate/tools/auto-apply/page.tsx`
   - Sections: Setup → Monitor → History
   - Show remaining credits

2. **Build BatchSetup component** (2 hours)
   - Form with filters:
     - Job search: role, location, company
     - Visa sponsorship required
     - Salary range
     - Job type (Full-time, Contract, etc.)
     - Target count (how many jobs)
   - Advanced options:
     - Optimize resume for each job
     - Generate custom cover letters
     - Include portfolio links
   - "Start Batch" button

3. **Build BatchMonitor component** (2 hours)
   - Show batch progress: 34/100 jobs applied
   - Real-time status updates (polling or WebSocket)
   - Live feed:
     - Applying to Amazon SDE role... (in progress)
     - Applied to Microsoft data analyst ✓
     - Failed to apply to Google (network error)
   - Show elapsed time and estimated time remaining

4. **Build JobResults component** (2 hours)
   - Table: Job Title | Company | Applied Date | Status | Actions
   - Filter by status (Success, Failed, Pending)
   - Search by company/role
   - Actions: View application, Retry, Mark as interested
   - Export results as CSV

5. **Build CreditsDisplay component** (1 hour)
   - Show available credits (e.g., 950/1000)
   - Show usage breakdown (this batch used 100)
   - Link to upgrade page
   - Warn if running low

6. **Create useAutoPilot hook** (2 hours)
   - State: batch data, jobs, progress
   - API calls: createBatch, startBatch, getStatus, retryJob
   - Real-time updates (polling every 2 seconds during batch)
   - Error handling

7. **Write tests** (2 hours)
   - Test batch creation with various filters
   - Test real-time status updates
   - Test credit calculation
   - Accessibility and mobile tests

**Deliverable:**
- Complete auto-apply dashboard
- 5 components + hook
- Real-time progress tracking
- Credit management UI

**Success Criteria:**
- Batch creation filters work correctly
- Real-time updates every 1-2 seconds
- UI handles slow network gracefully
- Credit display is accurate
- Mobile responsive
- Tests pass

---

### 2.4 INTERVIEW PREPARATION

**Backend Architect: Extend Mock Interview Routes**

**Status:** Starts after database & AI clients ready

**Current State:**
- Route exists: `backend/src/routes/mock-interviews.ts` (may exist, verify)
- Needs integration with new AI clients

**Tasks:**

1. **Create/enhance mock interview route** (3 hours)
   - Endpoint: `POST /api/interview-prep/start-session`
   - Parameters:
     - `candidateId`
     - `jobId` (optional, for role-specific questions)
     - `role` - "Software Engineer" | "Product Manager" | "Data Scientist" | etc.
     - `difficulty` - "Beginner" | "Intermediate" | "Advanced"
     - `sessionType` - "Behavioral" | "Technical" | "Mixed"
   - Create `InterviewSession` record
   - Call Anthropic to generate 5-10 role-specific questions
   - Store questions in session

2. **Add question retrieval endpoint** (1 hour)
   - Endpoint: `GET /api/interview-prep/session/:sessionId/question/:index`
   - Return current question + context
   - Include tips for answering this type of question

3. **Add answer submission endpoint** (2 hours)
   - Endpoint: `POST /api/interview-prep/session/:sessionId/answer`
   - Parameters: `questionIndex`, `answer` (text or video URL)
   - Save answer to session
   - Call Anthropic to evaluate answer:
     - Positives: what the candidate did well
     - Improvements: areas for better answers
     - Score: 1-10
     - Example strong answer for comparison
   - Save feedback to database
   - Return evaluation immediately

4. **Add session completion endpoint** (1 hour)
   - Endpoint: `POST /api/interview-prep/session/:sessionId/complete`
   - Calculate overall session score (average of question scores)
   - Generate summary report:
     - Overall score
     - Strengths
     - Areas for improvement
     - Practice recommendations
   - Save to `InterviewSession`

5. **Add feedback retrieval endpoint** (1 hour)
   - Endpoint: `GET /api/interview-prep/session/:sessionId/feedback`
   - Return full feedback report
   - Include:
     - Question-by-question breakdown
     - Overall strengths/weaknesses
     - Recommendations for improvement
     - Video links if provided

6. **Add previous sessions endpoint** (1 hour)
   - Endpoint: `GET /api/interview-prep/sessions/:candidateId`
   - Return list of past sessions with scores
   - Filter by role, date range
   - Show progress over time

7. **Add question bank endpoint** (1 hour)
   - Endpoint: `GET /api/interview-prep/questions`
   - Query params: `role`, `difficulty`, `type`
   - Return curated question bank
   - Useful for independent practice

8. **Add error handling & logging** (1 hour)
   - Log all session events
   - Handle timeout (video upload, AI evaluation)
   - Provide helpful error messages

**Deliverable:**
- Complete mock interview route with 8+ endpoints
- Full integration with Anthropic for question generation and evaluation
- `InterviewSession` model utilized
- Comprehensive feedback system

**Success Criteria:**
- Question generation completes in < 3 seconds
- Answer evaluation completes in < 5 seconds
- Scores are consistent and fair
- Feedback is helpful and detailed
- Sessions persist correctly
- Error handling is robust
- `npm test` passes

**Frontend Architect: Build Interview Prep Page**

**Status:** Starts after backend endpoints ready

**Tasks:**

1. **Create Interview Prep page** (3 hours)
   - File: `/frontend/src/app/candidate/tools/interview-prep/page.tsx`
   - Sections: Start Session → Active Session → Results → History
   - State machine: not_started → in_progress → completed

2. **Build SessionSetup component** (2 hours)
   - Select role (dropdown with 50+ roles)
   - Select difficulty (Beginner/Intermediate/Advanced)
   - Select session type (Behavioral/Technical/Mixed)
   - Optional: link to specific job posting
   - "Start Interview" button

3. **Build QuestionDisplay component** (2 hours)
   - Show current question (e.g., "Tell me about a time you handled conflict")
   - Show question number (e.g., "Question 3 of 8")
   - Show timer (if timed session)
   - Show question difficulty badge
   - Show category (behavioral, technical, etc.)

4. **Build AnswerInput component** (2 hours)
   - Text input (textarea)
   - Optional: video recording (using browser API)
   - Optional: upload video file
   - Character count (for text answers)
   - Save draft locally while typing
   - Submit button (moves to next question)

5. **Build FeedbackDisplay component** (2 hours)
   - Show evaluation after each answer:
     - Score (1-10 with colored indicator)
     - "What you did well" section
     - "Areas to improve" section
     - "Example strong answer" section
   - Option to continue to next question or retry current
   - Show overall session progress

6. **Build ResultsReport component** (2 hours)
   - Overall score (1-100)
   - Category breakdown (Behavioral: 7/10, Technical: 6/10, etc.)
   - Key strengths (top 3)
   - Key improvements (top 3)
   - Recommendations for next steps
   - Download report as PDF button

7. **Build SessionHistory component** (1 hour)
   - Table: Date | Role | Difficulty | Score | Duration | Actions
   - Actions: View Report, Retry, Delete
   - Filter by role, date range
   - Show score trends over time (chart)

8. **Create useInterviewSession hook** (2 hours)
   - State: session data, current question, answers, feedback
   - API calls: startSession, submitAnswer, getQuestion, complete
   - Handle timers and session state
   - Error recovery

9. **Write tests** (2 hours)
   - Test session creation with various roles
   - Test answer submission and feedback
   - Test results calculation
   - Accessibility and mobile tests

**Deliverable:**
- Complete interview prep page
- 7 components + hook
- Feedback system working
- Session history tracking

**Success Criteria:**
- Session starts and questions load quickly
- Answer evaluation provides meaningful feedback
- UI handles video and text inputs
- Results are accurate
- History tracks progress
- Mobile responsive
- Tests pass

---

### 2.5 JOB MATCHING & BOARD ENHANCEMENT

**Backend Architect: Enhance Job Routes**

**Status:** Starts after database ready

**Current State:**
- Route exists: `backend/src/routes/jobs.ts` (24KB)
- Already has job listing and filtering
- DECISION: EXTEND with AI matching

**Tasks:**

1. **Validate existing jobs.ts** (1 hour)
   - Understand current filtering and search logic
   - Identify where to add new features

2. **Add match score calculation** (3 hours)
   - Endpoint: `POST /api/jobs/match`
   - Parameters: `candidateId`, optional `jobIds`
   - For each job:
     - Call `job-matcher.ts` to score candidate
     - Score factors: skills, experience, visa, salary, culture
     - Create/update `JobMatchScore` records
     - Cache for 7 days
   - Return jobs sorted by match score

3. **Add ATS compatibility filter** (2 hours)
   - Endpoint: Enhanced `GET /api/jobs`
   - Query param: `matchScore=70` (min match percentage)
   - Return only jobs matching score threshold
   - Show match score in job listing
   - Color-code by match quality (>80 green, 60-80 yellow, <60 red)

4. **Add advanced filters** (2 hours)
   - Extend `GET /api/jobs` with:
     - `visaSponsorshipRequired=true|false`
     - `salaryMin=50000&salaryMax=120000`
     - `employmentType=full-time|contract|remote`
     - `yearsExperience=3-5`
   - Store popular filter combinations for quick access

5. **Add salary data to jobs** (2 hours)
   - Join jobs with `SalaryBenchmark` data
   - Show salary range for similar roles
   - Calculate if job salary is above/below market
   - Add `salaryMatch` to match score

6. **Add company info enrichment** (1 hour)
   - Include company details in job response:
     - Website, size, industry
     - Average interview difficulty
     - Average time-to-hire
     - Salary competitiveness
     - Review score (if available)

7. **Add saved jobs endpoint** (1 hour)
   - Endpoint: `POST /api/jobs/:jobId/save`
   - Endpoint: `GET /api/jobs/saved`
   - Endpoint: `DELETE /api/jobs/:jobId/save`
   - Store in database (relation to User)

8. **Add recommendations endpoint** (2 hours)
   - Endpoint: `GET /api/jobs/recommended`
   - Use match scoring to suggest jobs
   - Return personalized job feed
   - Sort by match score + recency

**Deliverable:**
- Enhanced `backend/src/routes/jobs.ts` with matching features
- `JobMatchScore` model utilized
- Advanced filtering working
- Salary data integrated
- Saved jobs and recommendations

**Success Criteria:**
- Match scoring is accurate and consistent
- Filtering is fast (< 1 second for 10K jobs)
- ATS scores correlate with data
- Salary data is populated correctly
- Recommendations are relevant
- `npm test` passes

**Frontend Architect: Enhance Job Board Page**

**Status:** Starts after backend endpoints ready

**Tasks:**

1. **Create/enhance Job Board page** (3 hours)
   - File: `/frontend/src/app/candidate/jobs/page.tsx`
   - Sections: Search/Filter → Job Listings → Job Detail
   - State: list view vs. detail view

2. **Build AdvancedFilter component** (3 hours)
   - Collapsible filter sidebar:
     - Role/Job Title (search/autocomplete)
     - Location (map or dropdown)
     - Salary Range (slider)
     - Visa Sponsorship (toggle)
     - Experience Level (dropdown)
     - Job Type (checkboxes)
     - Company Size (checkboxes)
     - Match Score (slider, e.g., 70+)
   - "Apply Filters" button
   - "Save Filter" button (named searches)
   - Show filter count badge

3. **Build JobCard component** (2 hours)
   - Show:
     - Job title + company logo
     - Match score (colored badge)
     - Salary range
     - Location (with remote option)
     - Key skills
     - "Apply Now" button
     - "Save Job" button
     - Visa sponsorship icon if available
   - Hover: show mini company info

4. **Build JobDetail component** (3 hours)
   - Show full job posting
   - Sections:
     - Header: title, company, apply button
     - Match Analysis: why this job matches you
     - Job Description
     - Requirements & Skills (highlight which you have)
     - Salary & Benefits
     - Company Info
     - Interview Insights (if available)
     - Reviews/Ratings (if available)
   - Apply Now button (calls auto-apply or individual apply)
   - Save/Unsave button
   - Related jobs section

5. **Build MatchScoreBadge component** (1 hour)
   - Color-coded: green (80+), yellow (60-80), red (<60)
   - Show percentage
   - Tooltip with match breakdown

6. **Build SavedJobsList component** (1 hour)
   - Table or card view of saved jobs
   - Show save date
   - Quick apply button
   - Delete from saved button
   - Sort by save date or match score

7. **Build RecommendedJobs component** (1 hour)
   - Show 5-10 recommended jobs based on profile
   - "Based on your profile" label
   - Quick apply for each
   - Refresh to get new recommendations

8. **Create useJobBoard hook** (2 hours)
   - State: jobs list, filters, selected job, saved jobs
   - API calls: getJobs, match, saveJob, recommend
   - Pagination and infinite scroll
   - Caching

9. **Write tests** (2 hours)
   - Test filtering and search
   - Test match score display
   - Test save/unsave functionality
   - Accessibility and mobile tests

**Deliverable:**
- Enhanced job board page
- 7 components + hook
- Advanced filtering working
- Match score visualization
- Saved jobs and recommendations

**Success Criteria:**
- Job listing loads in < 2 seconds
- Filtering is responsive (< 500ms)
- Match scores display correctly
- Save/unsave works instantly
- Job details page is detailed and helpful
- Mobile responsive
- Tests pass

---

### 2.6 ATS SCANNER & RESUME FEEDBACK

**Note:** This is partially covered in Resume Builder (2.1). This section focuses on standalone ATS tool.

**Backend Architect: Create ATS Scanner Routes** (if not already complete in 2.1)

**Status:** Depends on Resume Builder completion

**Tasks:**
- Endpoint: `POST /api/tools/ats-scanner`
- Upload resume → scan → detailed report
- Covered above; ensure routes exist

**Frontend Architect: Build ATS Scanner Page**

**Status:** Starts after backend ready

**Tasks:**

1. **Create ATS Scanner page** (2 hours)
   - File: `/frontend/src/app/candidate/tools/ats-scanner/page.tsx`
   - Sections: Upload → Report → Suggestions

2. **Build ResumeUpload component** (1 hour)
   - File input (drag & drop)
   - Accept PDF, DOCX, TXT
   - Show file preview

3. **Build ATSReport component** (2 hours)
   - ATS Score display (large, color-coded)
   - Sections:
     - Formatting Issues (with fixes)
     - Missing Keywords (show job description keywords not in resume)
     - Skill Gaps (highlight weak areas)
     - Improvement Suggestions
   - Before/After view (original vs. suggested fixes)
   - Download fixed resume button

4. **Build KeywordAnalysis component** (1 hour)
   - Show words found in job description but not in resume
   - Show words in resume that match job
   - Visualization: cloud or list with frequency

5. **Create useATSScanner hook** (1 hour)
   - State: file, scanning status, report data
   - API calls: scanResume, getReport
   - Error handling

6. **Write tests** (1 hour)
   - Test upload and scanning
   - Test report accuracy
   - Accessibility and mobile tests

**Deliverable:**
- ATS scanner page
- 4 components + hook
- Detailed scanning and reporting

**Success Criteria:**
- Upload and scanning completes in < 3 seconds
- Report is accurate and actionable
- Suggestions are helpful
- Mobile responsive
- Tests pass

---

### 2.7 SALARY NEGOTIATION & INSIGHTS

**Backend Architect: Create Salary Routes**

**Status:** Starts after database ready

**Tasks:**

1. **Create salary endpoint** (2 hours)
   - Endpoint: `GET /api/salary/market-data`
   - Query: `role`, `location`, `country`, `currency`
   - Return `SalaryBenchmark` data:
     - Min/median/max salary
     - Percentile breakdown
     - Historical trends (if available)
     - Regional comparison

2. **Add salary guidance endpoint** (2 hours)
   - Endpoint: `POST /api/salary/negotiation-guidance`
   - Parameters: `role`, `yearsExperience`, `location`, `currentSalary`, `offerSalary`
   - Call Anthropic for personalized guidance:
     - Should you negotiate? (yes/no with reasoning)
     - What to ask for (specific number or range)
     - Talking points for negotiation
     - Red flags to watch for
   - Store guidance in database (optional)

3. **Add salary comparison endpoint** (1 hour)
   - Endpoint: `GET /api/salary/compare`
   - Compare salary across roles, locations, companies
   - Show cost of living adjustment if applicable

4. **Add salary insights dashboard endpoint** (1 hour)
   - Endpoint: `GET /api/salary/insights/:candidateId`
   - Show:
     - Current market rate for candidate's role
     - Potential salary progression
     - Salary by company/region
     - Negotiation success rates

**Deliverable:**
- Salary routes with 4 endpoints
- Integration with Anthropic for guidance
- Market data populated

**Success Criteria:**
- Salary data is accurate and current
- Guidance is personalized and helpful
- Comparison tool is fast
- Insights are actionable

**Frontend Architect: Build Salary Insights Page**

**Status:** Starts after backend ready

**Tasks:**

1. **Create Salary Insights page** (3 hours)
   - File: `/frontend/src/app/candidate/tools/salary-insights/page.tsx`
   - Sections: Market Data → Negotiation Guidance → My Salary

2. **Build MarketDataChart component** (2 hours)
   - Display salary distribution (min/median/max)
   - Chart types: bar, box plot, or histogram
   - Filter by role, location, experience
   - Show percentile position

3. **Build RegionalComparison component** (2 hours)
   - Compare salary across countries/cities
   - Table or map view
   - Currency conversion (candlestick chart for rates)
   - Cost of living adjustment option

4. **Build NegotiationGuide component** (2 hours)
   - Input section: role, experience, location, offer
   - Display:
     - Recommended salary range
     - Negotiation talking points (bullet list)
     - Red flags to watch
     - Success probability (based on role/location)
   - "Get Personalized Guidance" button

5. **Build SalaryGrowthChart component** (1 hour)
   - Show salary progression over years
   - Path from current to senior role
   - Regional comparison line chart

6. **Create useSalaryInsights hook** (1 hour)
   - State: role, location, market data
   - API calls: getMarketData, getGuidance, getComparison
   - Error handling

7. **Write tests** (1 hour)
   - Test market data fetch and display
   - Test guidance generation
   - Test currency conversion accuracy
   - Accessibility tests

**Deliverable:**
- Salary insights page
- 5 components + hook
- Market data visualization
- Personalized guidance

**Success Criteria:**
- Market data loads quickly
- Charts render correctly
- Guidance is helpful and specific
- Currency conversion is accurate
- Mobile responsive
- Tests pass

---

## PHASE 3: AFRICAN-SPECIFIC FEATURES (Week 5-6)

### Goal
- Implement Africa-specific differentiation
- Multi-language support
- Local market data
- Visa and immigration features
- Currency and localization

### 3.1 MULTI-LANGUAGE SUPPORT

**Backend & Frontend Task (small scope)**

- Languages: English, French, Portuguese, Arabic, Swahili
- Use i18n library (`next-intl` for Next.js)
- Create translation files for all new AIApply features
- Test RTL languages (Arabic) layout

**Deliverable:**
- Translation files for all 7 features
- Language selector in header
- RTL support for Arabic
- Documentation on adding new languages

---

### 3.2 VISA & IMMIGRATION FEATURES

**Database Agent: Add Models**
- `VisaSponsorshipProfile` - track candidate visa needs
- Extend `Job` model with visa sponsorship data

**Backend Architect: Create Routes**
- Endpoint: `GET /api/immigration/visa-requirements/:country`
- Endpoint: `POST /api/immigration/sponsorship-check`
- Call Anthropic for country-specific guidance

**Frontend Architect: Build Visa Filter & Info**
- Add visa sponsorship toggle to job filters
- Create visa requirements page
- Show visa sponsorship match on jobs

---

### 3.3 CURRENCY & LOCALIZATION

**Database Agent: Extend Models**
- Add `currency` field to salary benchmarks
- Store exchange rates

**Backend Architect: Add Currency Routes**
- Endpoint: `GET /api/currency/rates`
- Fetch daily exchange rates (external service)
- Cache for 24 hours

**Frontend Architect: Add Currency Selector**
- Currency dropdown in salary insights page
- Auto-detect based on location
- Real-time conversion

---

### 3.4 AFRICAN MARKET DATA ENRICHMENT

**Database Agent: Seed Data**
- 100+ African companies
- Salary data by country (NGN, KES, ZAR, EGP, GHS)
- Interview difficulty ratings
- Visa sponsorship info by country

**Deliverable:**
- Comprehensive African job market database
- Seeding script
- Data validation

---

## PHASE 4: TESTING & DEPLOYMENT (Week 7)

### Goal
- Comprehensive test coverage
- Security audit
- Performance validation
- Production readiness
- Staged rollout to production

### 4.1 QA AGENT: Complete Test Suite

**Tasks:**

1. **Unit Tests** (15 hours)
   - All backend routes: 100+ test cases
   - All frontend components: 80+ test cases
   - All utility functions and hooks
   - Target: > 80% code coverage

2. **Integration Tests** (10 hours)
   - End-to-end flows:
     - Resume creation → Optimization → ATS scan → Export
     - Job search → Auto-apply → Status tracking
     - Interview prep → Answer submission → Feedback
     - Salary query → Negotiation guidance
   - Database transactions (create/update/rollback)
   - API error scenarios

3. **API Validation** (8 hours)
   - Test all 50+ endpoints with:
     - Valid inputs (happy path)
     - Invalid inputs (validation)
     - Missing fields (error handling)
     - Large payloads
     - Concurrent requests
   - Verify response format consistency
   - Check error message clarity

4. **Performance Testing** (10 hours)
   - Resume optimization: < 5 seconds
   - Job search + filtering: < 1 second for 10K jobs
   - Auto-apply batch (100 jobs): < 120 seconds
   - AI API response time: < 5 seconds (p95)
   - Frontend page load: < 2 seconds
   - Database query performance (add indices if needed)

5. **Security Audit** (8 hours)
   - Authentication/authorization on all protected routes
   - SQL injection prevention (use Prisma)
   - XSS prevention in AI-generated content
   - Rate limiting on AI APIs
   - API key security (never in logs)
   - CORS configuration correct
   - HTTPS enforced
   - OWASP Top 10 checks

6. **Accessibility Testing** (8 hours)
   - WCAG AA compliance for all pages
   - Keyboard navigation (Tab, Enter, Escape)
   - Screen reader testing (axe, NVDA)
   - Color contrast verification
   - Form labels and aria-labels
   - Mobile zoom and text scaling

7. **Browser Compatibility** (6 hours)
   - Chrome, Firefox, Safari, Edge (latest 2 versions)
   - Mobile browsers (iOS Safari, Chrome mobile)
   - Responsive design on all screen sizes
   - Polyfills for older browsers if needed

8. **AI Integration Testing** (10 hours)
   - Test all Anthropic client functions
   - Test fallback to OpenAI
   - Test with various input types
   - Test error recovery
   - Verify response quality
   - Test token usage tracking

9. **Database Testing** (6 hours)
   - Migration up/down works correctly
   - Data integrity constraints
   - Seed data loads without errors
   - Query performance is acceptable
   - Backup and recovery procedures

10. **Load Testing** (8 hours)
    - 100 concurrent users on API
    - 1000 jobs being searched simultaneously
    - 50 auto-apply batches running in parallel
    - Monitor: CPU, memory, database connections, error rate
    - Identify bottlenecks and optimize

11. **Smoke Testing** (6 hours)
    - Deploy to staging
    - Run critical path tests:
      - User signup and authentication
      - Resume creation and optimization
      - Job search and filtering
      - Auto-apply flow
      - Interview prep
      - Salary insights
    - Monitor logs for errors

12. **Create QA Report** (6 hours)
    - Document all test results
    - Coverage summary (unit, integration, end-to-end)
    - Performance benchmarks
    - Security findings
    - Known issues and workarounds
    - Recommendations for fixes
    - Final APPROVED or BLOCKED decision

**Deliverable:**
- Comprehensive QA report: `docs/qa-reports/2026-04-09-aiapply-qa-report.md`
- Test code and scripts
- Coverage metrics
- Performance baselines
- APPROVED or BLOCKED status

**Success Criteria:**
- Unit test coverage > 80%
- All integration tests pass
- No critical security issues
- Performance meets targets
- All critical flows work end-to-end
- WCAG AA compliance achieved
- Report is thorough and actionable

---

### 4.2 DEPLOYMENT & ROLLOUT

**Infrastructure Agent: Deploy to Staging**

1. **Deploy database migrations** (1 hour)
   - Run Prisma migrations on staging DB
   - Verify schema is correct
   - Backup database before migration

2. **Deploy backend image** (1 hour)
   - Build Docker image with all changes
   - Push to ECR
   - Update App Runner service
   - Verify health checks pass

3. **Deploy frontend image** (1 hour)
   - Build Next.js production build
   - Push to ECR
   - Update App Runner service
   - Verify page loads correctly

4. **Run smoke tests** (30 min)
   - Hit `/health` endpoints
   - Test critical paths in browser
   - Check CloudWatch logs for errors
   - Verify staging URL is accessible

5. **Monitor for 24 hours** (continuous)
   - Watch error rates and latency
   - Check database performance
   - Verify AI API calls working
   - Monitor costs

6. **Get approval for production** (30 min)
   - Review QA report
   - Verify staging tests passed
   - Get sign-off from product/leadership
   - Plan production rollout schedule

7. **Deploy to production** (2 hours, if approved)
   - Same steps as staging
   - Use blue-green deployment if possible
   - Run smoke tests on production
   - Monitor closely for 24 hours
   - Have rollback plan ready

**Deliverable:**
- Staging deployment complete and verified
- Production deployment plan (if approved)
- Runbook update: STAGING_RUNBOOK.md with latest state
- Monitoring and alerting configured

**Success Criteria:**
- All services healthy
- AI APIs working
- No errors in logs
- Performance good
- Staging verified
- Ready for production

---

## CRITICAL DECISION MATRIX

Use this to avoid duplicating work and to ensure consistent architecture:

| Component | Exists? | Action | Owner |
|-----------|---------|--------|-------|
| Resume Builder route | YES (resume-builder.ts) | EXTEND with optimize, ATS, export | Backend Arch |
| Resume Builder page | MAYBE | CREATE if missing, ENHANCE if exists | Frontend Arch |
| Cover Letter route | YES (application-writer.ts) | EXTEND with tone, versioning | Backend Arch |
| Cover Letter page | LIKELY MISSING | CREATE full page | Frontend Arch |
| Auto-Apply route | YES (autopilot.ts) | EXTEND with matching, batching | Backend Arch |
| Auto-Apply dashboard | LIKELY MISSING | CREATE full page | Frontend Arch |
| Interview route | MAYBE | CREATE if missing, EXTEND if exists | Backend Arch |
| Interview page | LIKELY MISSING | CREATE full page | Frontend Arch |
| Job board route | YES (jobs.ts) | EXTEND with matching, filters | Backend Arch |
| Job board page | YES | ENHANCE with AI matching UI | Frontend Arch |
| ATS route | YES (ats.ts) | REUSE or EXTEND if needed | Backend Arch |
| ATS page | LIKELY MISSING | CREATE if needed | Frontend Arch |
| Salary routes | NO | CREATE new routes | Backend Arch |
| Salary page | NO | CREATE full page | Frontend Arch |
| ResumeOptimizationVersion model | NO | CREATE in schema | Database Agent |
| CoverLetterVersion model | NO | CREATE in schema | Database Agent |
| AutoApplyBatch model | MAYBE | CREATE or VALIDATE existing | Database Agent |
| InterviewSession model | MAYBE | CREATE or VALIDATE existing | Database Agent |
| ATSReport model | NO | CREATE in schema | Database Agent |
| SalaryBenchmark model | NO | CREATE in schema | Database Agent |
| JobMatchScore model | NO | CREATE in schema | Database Agent |
| Anthropic client | NO | CREATE new module | AI Integration Agent |
| OpenAI client | NO | CREATE new module | AI Integration Agent |

---

## DEPENDENCY & ORDERING RULES

**STRICT SEQUENCE (no parallelization):**
1. Database Agent FIRST - blocks everyone else
2. AI Integration Agent (parallel with DB, but needed before backend routes)
3. Infrastructure Agent (parallel with DB)
4. Backend Architects (after 1, 2, 3)
5. Frontend Architects (after Backend ready)
6. QA Agent (after all features)
7. Infrastructure deployment (after QA approval)

**WITHIN-PHASE PARALLELIZATION:**
- Backend & Frontend Architects can work in parallel once database is ready
- Skills routes (resume-builder, application-writer, etc.) can be built in any order
- Frontend pages can be built in parallel once backend endpoints are ready
- QA can write tests in parallel with feature development

---

## SUCCESS CRITERIA (FINAL)

### Database
- [ ] 7 new models created and migrated
- [ ] All foreign keys defined
- [ ] All indices created
- [ ] Seed data loaded successfully
- [ ] Migration is reversible

### AI Integration
- [ ] Anthropic client working and tested
- [ ] OpenAI fallback client working
- [ ] Response validation prevents bad outputs
- [ ] Cost tracking accurate
- [ ] Error handling robust

### Backend
- [ ] 30+ new endpoints across all features
- [ ] All routes use AI clients appropriately
- [ ] Error handling consistent across all routes
- [ ] Logging is comprehensive and helpful
- [ ] All tests pass (80%+ coverage)

### Frontend
- [ ] 7 feature pages built and working
- [ ] 40+ components created (reusable)
- [ ] All pages responsive on mobile
- [ ] Accessibility passes WCAG AA
- [ ] Performance meets targets (< 2s load time)

### Testing
- [ ] Unit test coverage > 80%
- [ ] All integration tests pass
- [ ] All 50+ endpoints tested
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] No critical issues remaining

### Deployment
- [ ] Code deployed to staging successfully
- [ ] All smoke tests pass
- [ ] Monitoring and alerting working
- [ ] STAGING_RUNBOOK.md updated
- [ ] Ready for production deployment

---

## AGENT RESPONSIBILITIES SUMMARY

### Database Agent
- Schema design and creation
- Migrations
- Seed data
- Data integrity
- Performance indices

### AI Integration Agent
- API client implementation
- Error handling and fallback
- Cost tracking
- Response validation
- Prompt engineering

### Infrastructure Agent
- Environment setup
- Secrets management
- CloudWatch dashboards
- Terraform changes
- Deployment coordination

### Backend Architect
- Route implementation
- Business logic
- Database queries
- Error handling
- API documentation
- Testing

### Frontend Architect
- Page and component creation
- UX/UI implementation
- State management
- API integration
- Accessibility
- Testing
- Mobile responsiveness

### QA Agent
- Test planning and execution
- Coverage reporting
- Performance testing
- Security audit
- Deployment validation
- Documentation

### Orchestrator (You)
- Dependency management
- Conflict resolution
- Progress tracking
- Architecture decisions
- Handoff coordination
- Documentation updates
- Final approval

---

## RISK MITIGATION

### Risk: Database Schema Changes Break Existing Features
- **Mitigation:** Test all new migrations on copy of prod data first
- **Owner:** Database Agent
- **Trigger:** Before deploying to staging

### Risk: AI API Costs Explode
- **Mitigation:** Set daily cost limits, implement rate limiting, test with mock responses first
- **Owner:** AI Integration Agent + Infrastructure Agent
- **Trigger:** Immediate cost tracking setup

### Risk: Auto-Apply Creates Bad User Experience (Mass Applications)
- **Mitigation:** Test with real users, implement job quality filtering, set conservative defaults
- **Owner:** Backend Architect + QA Agent
- **Trigger:** Before launching to users

### Risk: AI-Generated Content (Resume, Cover Letter) Is Low Quality
- **Mitigation:** Test with real jobs, get user feedback, implement quality checks
- **Owner:** AI Integration Agent + QA Agent
- **Trigger:** Beta testing phase

### Risk: Performance Degrades With New Features
- **Mitigation:** Load testing, database optimization, caching strategy
- **Owner:** QA Agent + Infrastructure Agent
- **Trigger:** Before staging deployment

### Risk: Existing Features Break With New Code
- **Mitigation:** Comprehensive integration tests, blue-green deployment
- **Owner:** QA Agent
- **Trigger:** All tests must pass

---

## COMMUNICATION & STATUS UPDATES

**Weekly Syncs:**
- Every Monday: 30-min status call with all agents
- Discuss blockers, ask for help, celebrate wins
- Update STAGING_RUNBOOK.md after each sync

**Daily Standups (async):**
- Each agent posts: Done | Doing | Blocked
- Orchestrator resolves blockers immediately
- Escalate to team lead if needed

**Code Reviews:**
- All PRs require 2 approvals before merge
- Orchestrator approves architecture
- QA approves test coverage
- One other agent approves code quality

---

## TIMELINE SUMMARY

| Week | Phase | Deliverable | Status |
|------|-------|-------------|--------|
| 1-2 | Foundation | Schema, AI clients, infrastructure | To Start |
| 3-4 | Features | 7 core features, 7 pages | To Start |
| 5-6 | African Features | Multi-lang, visa, salary, currency | To Start |
| 7 | Testing & Deploy | QA report, staging deployment | To Start |
| 8+ | Production | Production deployment & monitoring | To Start |

---

## WHAT HAPPENS NEXT

1. **Orchestrator Review:** You read this plan and identify any gaps
2. **Agent Kickoff:** Present plan to all 6 agents, answer questions
3. **Database Agent Starts:** Create schema models immediately (highest priority)
4. **Parallel Start:** AI Integration + Infrastructure agents start in parallel
5. **Backend Kickoff:** Once database is ready (end of Week 1), Backend Architect starts
6. **Frontend Kickoff:** Once first backend routes done (mid-Week 2), Frontend Architect starts
7. **QA Prep:** QA Agent writes test plans while others are coding
8. **Weekly Syncs:** All agents sync up to resolve blockers
9. **Staging Deploy:** End of Week 6, deploy to staging for testing
10. **QA Testing:** Week 7, full QA cycle
11. **Production Ready:** Week 8+, deploy to production after approval

---

## CONCLUSION

This orchestration plan provides a clear roadmap for implementing the 7 core AIApply features across AfriTalent. Key principles:

1. **Database First:** All teams wait for schema
2. **Parallel Where Possible:** Backend, frontend, and infrastructure can run in parallel
3. **Testing Throughout:** QA embedded from the start
4. **Staged Rollout:** Staging first, then production
5. **Clear Dependencies:** No ambiguity about who does what
6. **Documented Progress:** STAGING_RUNBOOK.md is source of truth

The timeline is aggressive but achievable with 6 specialized agents working in coordination. The plan is flexible - if blockers arise, we adjust and update this document.

**Ready for approval. Waiting for orchestrator and agent team sign-off.**

---

**Generated:** April 9, 2026
**For:** AfriTalent Product Team
**Next Step:** Agent team review and kick-off
