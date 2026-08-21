# PDF Renderer and Controlled Egress Decision

## Status

Approved design, not deployed. The main backend no longer bundles Chromium and
only uses the configured private renderer endpoint. Production PDF export stays
unavailable until the renderer deployment and its image exception are approved.

## Renderer boundary

- Backend sends bounded generated HTML only; no caller-supplied URL, object key,
  user identity, or browser arguments cross the boundary.
- Requests use exact-body HMAC with a 300-second timestamp window and a strong
  shared secret injected at runtime.
- The renderer has no database credentials, does not persist documents, runs as
  a non-root user, and its ECS module specifies private subnets, no public IP,
  read-only root, capability drop, bounded CPU/memory/ephemeral storage,
  concurrency, input/output and execution-time limits.
- Fargate does not provide a portable custom seccomp/no-new-privileges control.
  Chromium's `--no-sandbox` use is an explicit residual risk, not remediation.
  PDF export requires a time-limited security exception while unfixed Chromium
  CVEs remain.

## Egress boundary

Workloads remain private. Supported AWS traffic should use VPC endpoints for
S3, ECR API/DKR, CloudWatch Logs, Secrets Manager, KMS and STS. External HTTP/
HTTPS must move through an authenticated proxy with a reviewed hostname allowlist
and redacted destination/policy-decision logs. Do not replace provider domains
with brittle IP allowlists. The proxy is the next privileged infrastructure
implementation because it needs a network route, security groups, workload
identity and logging sink; Network Firewall is the escalation option for
non-HTTP/compliance inspection.

## Release conditions

1. Platform creates the renderer secret and least-privilege task/execution roles.
2. Platform supplies the service-discovery ARN, renderer digest, proxy role ARN
   and egress-proxy endpoint through the approved path.
3. Review a read-only Terraform plan: no Aurora replacement/destruction, proxy
   role consumed externally, renderer private, no general workload egress.
4. Independently scan the renderer image and approve or reject the documented
   unfixed Chromium exception before enabling `RESUME_PDF_EXPORT_ENABLED`.
