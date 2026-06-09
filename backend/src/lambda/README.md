# Lambda entry points

Three Lambda handlers used by the new account architecture (see `MIGRATION_PLAN.md` §2).

| File | Trigger | Purpose | Status |
|---|---|---|---|
| `webhook-stripe.ts` | Lambda Function URL (Stripe dashboard) | Stripe billing webhook | **Production target** |
| `webhook-flutterwave.ts` | Lambda Function URL (Flutterwave dashboard) | Flutterwave billing webhook | **Production target** |
| `orchestrator-step.ts` | Step Functions Task | 6-agent AI orchestrator | **Optional / future** |

## How they reuse existing code

The webhook Lambdas wrap the existing Express webhook router at `routes/webhooks.ts` via [`serverless-http`](https://github.com/dougmoscrop/serverless-http). No fork of the handler logic. Each Lambda mounts the router but rejects any request whose path is not its dedicated provider — defensive isolation in case the Function URL is ever called with the wrong path.

The orchestrator Lambda calls `runOrchestrator()` from `lib/ai/orchestrator/index.ts` directly. Same persistence (`createAiRun` / `completeAiRun`), same logger.

## Build

The Lambdas are built as part of the existing `tsc` build:

```bash
cd backend
npm install
npm run build
# Outputs: dist/lambda/webhook-stripe.js, etc.
```

The Terraform Lambda module references `dist/lambda/<name>.handler` and packages `dist/` + `node_modules/` (production deps only).

## Deploy

Wired in `.github/workflows/deploy.yml` (Phase 0.3 deliverable):

```yaml
- name: Build backend
  run: cd backend && npm ci && npm run build && npm prune --production

- name: Package Lambdas
  run: |
    cd backend
    for fn in webhook-stripe webhook-flutterwave orchestrator-step; do
      zip -qr "../dist/lambda-${fn}.zip" \
        dist/lambda/${fn}.js dist/ node_modules/ package.json
    done

- name: Deploy via Terraform
  run: cd infra/terraform/accounts/dev && terraform apply -auto-approve
```

Terraform reads `dist/lambda-<name>.zip` and creates the function + Function URL (or Step Functions Task ARN).

## Local testing

### Webhooks

Run the existing Express server (`npm run dev`) — it mounts `webhooks.ts` at `/api/webhooks`. Stripe CLI:

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

### Orchestrator Lambda

Invoke locally with a sample event:

```bash
cd backend
npx tsx -e "
  import { handler } from './src/lambda/orchestrator-step.ts';
  const result = await handler(
    {
      userId: 'user-test-1',
      input: {
        run_type: 'resume_review',
        resume_text: 'Test resume…'.repeat(20),
      },
    },
    { awsRequestId: 'local', getRemainingTimeInMillis: () => 900000 } as any,
  );
  console.log(JSON.stringify(result, null, 2));
"
```

Set `MOCK_AI=1` to skip Anthropic calls.

## Why orchestrator stays "optional" in Phase 0

Today the Express route at `POST /api/orchestrator/run` runs `runOrchestrator()` synchronously and returns the full output. Moving it to Step Functions changes the request shape (return `run_id` immediately, frontend polls `GET /api/orchestrator/runs/:id`). That's a UX change.

Per the migration plan, **UX must not regress in this migration**. So the orchestrator Lambda exists as a deploy target and an A/B-testable alternative, but the user-facing route continues to call `runOrchestrator()` in-process on Fargate. We flip it to async after the migration when we have time to update the frontend.

## Connection management

Both webhook Lambdas and the orchestrator Lambda connect to PostgreSQL via **RDS Proxy** (env `DATABASE_URL` resolves to the proxy endpoint). RDS Proxy multiplexes connections — Lambda's create-and-discard pattern won't exhaust Aurora.

The Lambda VPC config places these in the application's private subnets so they can reach RDS Proxy and VPC endpoints (Secrets Manager / SSM / CloudWatch Logs / KMS). No internet egress is required for these Lambdas (Anthropic and Stripe SDK calls happen via the dedicated NAT instance — see migration plan §2.Network).
