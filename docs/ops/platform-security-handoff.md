# Platform Security Handoff: Scanner, Renderer, Egress, and RDS Proxy

## Status

This is a review-only handoff. No Terraform apply, IAM mutation, secret
creation, deployment, migration, or production feature enablement is requested
by this branch.

## Inputs the platform team must supply

| Need | Repository input / relationship | Least-privilege requirement |
| --- | --- | --- |
| RDS proxy service role | `rds_proxy_role_arn`, format `arn:aws:iam::<account-id>:role/<name>` | Trusted by `rds.amazonaws.com`; only `secretsmanager:GetSecretValue` for the Aurora credential secret and `kms:Decrypt` for that secret's KMS key. The application deployment role must not receive `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:CreateRole`, or equivalent role mutation. |
| Immutable application images | `image_digest_backend`, `image_digest_frontend`, both `sha256:<64 hex>` | ECR repositories keep immutable tags; ECS task definitions consume `repository@digest`, never `latest`. |
| Renderer image and service discovery | `modules/pdf-renderer` inputs: `image_ref`, `service_discovery_service_arn`, `private_subnet_ids`, `security_group_id`, `cluster_arn`, `execution_role_arn`, `task_role_arn`, `shared_secret_arn` | Renderer is private/no public IP. `image_ref` must use `@sha256:`. Task role gets no database access and no broad internet egress. |
| Renderer callback secret | Renderer `shared_secret_arn`; application `PDF_RENDERER_SHARED_SECRET` sourced from the approved secret manager | 32+ byte secret, read by only backend and renderer task roles. No value in Terraform state, command line, image, or logs. |
| Scanner callback secret | Application `RESUME_SCANNER_WEBHOOK_SECRET` and worker secret reference (proposed platform input: `scanner_callback_secret_arn`) | Same secret for authenticated callback only; worker has no database credential. Rotate through a staged worker/application rollout. |
| Scanner worker access | Platform-owned worker task/execution roles | Read only `s3:GetObjectVersion` on approved resume/quarantine prefixes and `kms:Decrypt` on the matching key; no S3 write/delete and no database credentials. |
| Controlled egress | Private workload subnet route plus authenticated proxy endpoint/identity (proposed `egress_proxy_url` and allowlist policy artifact) | Backend/renderer/worker egress only to DNS, VPC endpoints and proxy. Proxy logs workload identity, hostname and policy result without credentials, query strings, keys, or PII. |
| Public edge | Approved ACM certificate ARN and WAF association | Only intended ALB/CloudFront/API edge may be public. HTTP listener redirects permanently to HTTPS; invalid headers are dropped; ECS, proxy, renderer, workers, database and RDS proxy stay private. |
| Read-only plan authority | Read-only AWS/Terraform plan session scoped to the target workspace | Enough read actions to resolve existing resources and generate a plan, but no create/update/delete/IAM mutation. |

## Scanner production gate

`RESUME_SCANNER_MODE=callback` is prohibited until a worker satisfies the
version-pinned object-read, bounded download/scan, stable delivery-ID, HMAC,
retry/DLQ, metrics/alarm, quarantine-retention, historical-backlog, and incident
pause contract in [the scanner worker runbook](resume-scanner-worker-runbook.md).
The worker receives no database credentials. If any prerequisite is missing,
production must use `RESUME_SCANNER_MODE=disabled`: resume registration returns
sanitized `503`, files remain non-CLEAN/non-downloadable, and no upload is
silently accepted as scan-ready.

## Renderer residual risk and enablement gate

The isolated renderer image currently has 78 HIGH/CRITICAL findings, including
22 `chromium`/`chromium-common` findings. The Chromium CVEs are
`CVE-2026-76033`, `CVE-2026-76036`–`CVE-2026-76041`,
`CVE-2026-76043`–`CVE-2026-76045`, and `CVE-2026-76047`; Trivy reported no
Debian fixed version for the selected build. Private-only networking, HMAC
freshness/raw-body verification, generated-HTML-only input, no arbitrary URL
rendering, input/output/timeout/concurrency limits, non-root execution,
read-only filesystem and dropped capabilities reduce reachability but do not
remediate the Chromium CVEs.

`RESUME_PDF_EXPORT_ENABLED` stays `false`. It may become `true` only after: (1)
a compatible patched renderer image passes scanning, (2) another maintained
browser runtime passes these gates, or (3) an authorized security owner signs a
time-limited exception. No exception is requested or approved here.

## Terraform review acceptance criteria

With the approved role ARN and read-only authority, run only a non-applying
plan. It must show:

1. zero Aurora replacement/deletion and deletion protection unchanged;
2. no unintended database, secret, subnet, security-group, or KMS changes;
3. RDS proxy consuming `rds_proxy_role_arn`, with the intended Aurora writer
   target and no application-path inline IAM-policy action;
4. immutable digest references for backend/frontend and any renderer image;
5. renderer and scanner private, with public ingress only at approved edge;
6. HTTPS/ACM/WAF/invalid-header controls present, explicit IPv4/IPv6 handling,
   and no automatic PDF/scanner enablement;
7. secret references only—never plaintext secret values in state;
8. explicit ECS desired-count and migration ordering: proxy target healthy,
   controlled migration task, then one backend task and health check before
   scale-out; and
9. no unrelated replacement or destructive action.

## Partial-apply recovery and rollback

Keep the existing Aurora cluster/state pending explicit approval. Platform first
creates or selects the proxy role, grants scoped secret/KMS access, reconciles
the suspended proxy and writer target, validates network/secret/KMS health,
reviews a saved read-only plan, then applies through the authorized workflow.
Run migrations as a controlled one-off task only after proxy health, deploy one
backend task with scanner disabled and PDF export disabled, verify readiness and
callback rejection behavior, then scale. Rollback blocks the new image digest,
returns to the last verified task definition, disables intake if scanner
integrity is uncertain, and never deletes Aurora data or marks pending resumes
clean.
