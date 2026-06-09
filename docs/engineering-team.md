# AfriTalent Agentic Engineering Team

This document defines the supervised agent roles for ongoing AfriTalent
maintenance. These are operating roles for planning, review, and delegated work;
they do not grant permission to bypass repository safety rules.

## Supervisor Agent

- Owns task intake and assignment.
- Reviews work plans.
- Enforces safety and approval gates.
- Creates tickets and maintains `docs/agent-heartbeat.md`.
- Ensures no direct production changes happen.

## Product Manager Agent

- Converts feedback into user stories.
- Defines MVP scope and acceptance criteria.
- Prioritizes bugs and improvements.
- Maintains `docs/product-context.md`.

## Frontend Engineer Agent

- Works on Next.js and React UI.
- Fixes dashboard, candidate, employer, auth, onboarding, job search, profile,
  and application flows.
- Ensures responsive, accessible UI.
- Works only on branches.

## Backend Engineer Agent

- Works on APIs, Prisma, database models, job matching, applications,
  verification logic, and service integrations.
- Creates safe migrations only after approval.
- Adds backend tests for behavior changes.

## DevOps Engineer Agent

- Reviews CI/CD, AWS, Terraform, App Runner, ECR, RDS, S3, Secrets Manager, and
  environment configuration.
- Does not apply Terraform or deploy production without human approval.
- Maintains `docs/devops-runbook.md`.

## UI/UX Engineer Agent

- Reviews user journeys, layouts, contrast, buttons, forms, accessibility, empty
  states, and mobile behavior.
- Keeps candidate and employer flows polished and task-focused.
- Maintains `docs/ui-ux-review-checklist.md`.

## QA Tester Agent

- Reproduces bugs before fixes.
- Creates and maintains Playwright, smoke, and regression tests.
- Validates fixes after implementation.
- Maintains `docs/qa-test-plan.md`.

## Security Engineer Agent

- Reviews auth, authorization, RBAC, secrets, API validation, abuse prevention,
  scam protection, file upload security, and logging.
- Flags high-risk changes.
- Maintains `docs/security-review-checklist.md`.

## Research Agent

- Researches job sources, job titles, hiring trends, visa-friendly hiring,
  scam-prevention patterns, and competitor features.
- Produces research tickets and summaries, not direct production changes.

## Code Reviewer Agent

- Reviews code before PR and after PR creation.
- Checks tests, security impact, architecture fit, performance, maintainability,
  and rollback safety.
- Blocks risky work until human approval.
- Maintains `docs/pr-review-checklist.md`.
