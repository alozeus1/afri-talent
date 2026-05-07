---
name: afritalent-operator
description: Use this skill when working on AfriTalent delivery, staging operations, CI/CD, AWS App Runner deployments, Terraform changes, project continuity, or high-level project communications that require fast orientation to the repo and live environment.
---

# AfriTalent Operator

## Overview

This skill gives Codex a compact operating model for AfriTalent. Use it for release engineering, staging recovery, infrastructure changes, delivery hardening, operational handoff, and roadmap execution where project-specific context matters more than generic coding guidance.

## When To Use This Skill

- deployment and staging repair
- GitHub Actions and CI/CD changes
- Terraform and App Runner reconciliation
- operational handoff and transfer-of-knowledge docs
- project status updates and operator-facing documentation
- public-safe project summaries that must reflect the real repo and live environment without exposing sensitive implementation detail
- pre-prod readiness reviews
- roadmap work for retrieval, matching, and agentic platform features
- product workflow fixes touching jobs, applications, learning, trust, companies, billing entitlements, AI assistant behavior, or employer/candidate dashboards

## Operating Workflow

### 1. Load Context Fast

Read these files in order:

1. `AGENT_BOOTSTRAP.md`
2. `STAGING_RUNBOOK.md`
3. `AGENTS.md`
4. `docs/ops/CICD_OPERATING_MODEL.md`

If the task is marketing, founder narrative, or public project communication, also read:

5. `.agents/product-marketing-context.md` if it exists
6. `docs/marketing/` artifacts relevant to the request

Then load only the specific code or Terraform modules required by the task.

### 2. Confirm The Active Runtime And Branch State

Do not assume historical docs are still accurate. Verify current runtime and deployment path from:

- `STAGING_RUNBOOK.md`
- `.github/workflows/deploy-apprunner.yml`
- `infra/terraform/envs/staging/terraform.tfvars`

As of May 1, 2026, the active shared non-prod path is AWS App Runner plus ECR plus RDS, not Railway.

Before edits or commits:

- run `git status --short`
- inspect diffs for any file you will touch if it is already dirty
- stage with explicit path lists or `git add -p` when shared files such as `frontend/src/lib/api.ts`, `backend/src/routes/trust.ts`, or E2E specs have unrelated local edits
- never assume all dirty files are yours; AfriTalent sessions commonly include pre-existing OAuth, notification, feedback, Playwright, and docs changes
- after a push, check GitHub Actions immediately with `gh run list --branch develop --limit 5` and watch failing CI runs before declaring work done

### 3. Respect Project Rules

- Treat `STAGING_RUNBOOK.md` as the source of truth for live environment state
- Update `STAGING_RUNBOOK.md` after any material live change
- Do not revert unrelated changes in `backend/dist/*`
- Do not revert unrelated changes in `infra/terraform/modules/apprunner/*`
- Preserve unrelated local work in dirty route/API/test files; use partial staging instead of broad `git add .`
- Keep infra, deploy, and handoff changes well documented in the same session
- For public-facing summaries, describe the mission, stack, delivery discipline, and product direction without exposing ranking logic, trust scoring internals, partner specifics, or unpublished moat mechanics

### 4. Product Delivery Hotspots

When a request touches product behavior, check the real route/data contract before patching:

- Candidate profile: frontend may send `null` for optional URL/text fields; backend Zod schemas should accept `null`, empty strings, and omitted fields where the UI supports clearing values.
- Learning: course progress must persist through backend APIs, not only `localStorage`; update UI badges and E2E expectations together.
- Trust uploads: presigned S3 PUT headers must match the signed command, including KMS/SSE headers when configured.
- Company directory: registered `Employer` profiles and seeded `Company` records are separate models. Directory search should include both, and tests must not assume only empty demo profiles.
- Employer jobs: registered employers need AfriTalent direct apply by default, with optional employer-site application URLs. Employer-posted jobs should outrank scraped/external jobs where relevance is comparable.
- Employer applications: unpaid employers may see application counts/anonymized rows, while active employer paid plans unlock full candidate details and processing.
- Premium branding: dashboard/company branding fields such as logo URL and colors must be gated to active `EMPLOYER_PREMIUM` subscriptions at the API level, not only disabled in the UI.
- Trust automation: automated verification reviews should create metadata and trust-case actions for admin review; do not auto-approve sensitive documents without an explicit safe rule.
- Messaging safety: trust guidance should be concrete and visible on the messages page, especially fee requests, off-platform pressure, identity document requests, domain mismatch, and salary bait.
- Translation gaps: static UI strings can use i18n dictionaries; database-backed job descriptions, learning content, and profile data need a deliberate content-translation strategy and should not be faked with partial static labels.

### 5. Validate Before Shipping

Use these commands when applicable:

```bash
cd backend && npm run lint && npm run typecheck && npm test && npm run build
cd frontend && npm run lint && npx tsc --noEmit && npm run test:unit:ci && npm run build
cd infra/terraform && terraform fmt -check -recursive && terraform init -backend=false && terraform validate
```

For delivery changes, also validate:

- GitHub Actions syntax
- Gitleaks
- Checkov
- TFLint

For product/UI changes, also run or inspect the relevant Playwright coverage. Current high-signal specs include:

- `frontend/e2e/ui-agent3-browser-qa.spec.ts`
- `frontend/e2e/ui-ux-quick-wins.spec.ts`
- `frontend/e2e/ui-learning-feedback.spec.ts`
- `frontend/e2e/ui-phase2-regression.spec.ts`

If a product change intentionally changes copy, empty states, or directory behavior, update the affected E2E assertions in the same commit. Do not leave CI to discover stale test expectations after the push.

### 6. GitHub Actions Triage After Push

Use this loop after pushing to `develop`:

1. `gh run list --branch develop --limit 5`
2. watch the CI run, not only Security/Terraform
3. if CI fails, open the failed job log and fix in a follow-up commit
4. if Deploy Shared Environment fails, read `STAGING_RUNBOOK.md` before changing infra or workflow code
5. if only Lighthouse fails, inspect whether it is a real regression or an environment/performance threshold issue before weakening assertions

Known recurring warnings that should not be confused with hard failures:

- GitHub Actions Node.js 20 deprecation warnings
- existing lint warnings for unused imports and `<img>` usage
- Dependabot vulnerability notices on push

### 7. Keep The Pre-Prod Gap List Visible

These are the current cleanup targets:

- Stripe test/live credential setup and billing entitlement verification
- broader Terraform reconciliation under the intended AWS path
- semantic retrieval and matching validation at staging scale
- learning/course progress, trust verification workflow, and employer application monetization need end-to-end browser regression coverage after each major change
- GitHub Actions still emits Node 20 deprecation warnings that should be cleaned up in a follow-on CI maintenance pass
- verify each latest App Runner deploy reaches full completion before treating staging as settled

## Product Direction Notes

AfriTalent is strongest today in:

- trust and risk signaling
- ATS depth
- employer onboarding
- candidate AI workflow
- premium employer workflow and paid-plan gating
- safety messaging and verification workflows

It still needs work in:

- semantic search
- recruiter workflow depth
- market intelligence
- durable data moat
- multilingual dynamic content translation
- robust E2E coverage around cross-role application flows

Priority background agents to build next:

- `job-discovery-agent`
- `match-ranking-agent`
- `application-pack-agent`
- `recruiter-copilot-agent`
- `trust-risk-agent`
- `mobility-readiness-agent`
- `verification-review-agent`
- `learning-progress-agent`
- `employer-branding-agent`

## Current May 1, 2026 Notes

- shared staging remains the only active shared non-prod environment
- recent product work added/changed candidate profile validation, S3 verification upload headers, employer/company directory merging, persisted learning progress, premium employer branding, registered-employer application options, employer application paywalling, official immigration/resource expansion, and trust-case automated review metadata
- company-directory E2E tests must reflect the current behavior: registered employers appear in the directory, and the empty state uses honest early-access/candidate-action messaging rather than fake demo employer cards
- CI run `25230215619` on commit `510e9e3` passed core lint/typecheck/build/tests but failed Playwright because stale company-directory E2E assertions expected old demo copy; align specs with current product behavior when following up
- always check the newest CI and deploy run before assuming the latest App Runner rollout is fully settled
- the strongest externally shareable themes right now are:
  - Africa-to-global talent access
  - trust-first hiring workflow
  - full-stack delivery discipline
  - modern CI/CD and DevOps practices

## Communication Guardrails

When asked to describe AfriTalent publicly:

- emphasize the mission, product direction, stack, SDLC, and operational rigor
- mention trust, workflow, ATS direction, and intelligent matching only at a high level
- avoid publishing exact scoring logic, unreleased roadmap sequencing, partner specifics, internal runbook-only details, or anything that reduces future defensibility

## References

- `references/read-order.md`
- `references/next-agent-roadmap.md`
