# AfriTalent security gauntlet status

- Current branch: `security/resume-scanner-final-verification`. Latest
  functional code commit before this final evidence ledger is `f9e5154`.
- Completed gates: account authority and BOLA foundations; upload ownership;
  n8n and Stripe webhook hardening; Flutterwave/ATS ownership hardening;
  external CV containment; resume quarantine and scanner callback control plane.
- Scanner evidence: raw-body HMAC, safe-integer ±300-second timestamp check,
  delivery identity, version-pinned job/resume binding, transactional audit,
  replay conflict rejection, and bounded ERROR/EXHAUSTED transitions are
  retained in `resume-scanner-webhook-security.test.ts`. Real PostgreSQL route
  coverage proves CLEAN, exact replay, object-version rejection, and a
  concurrent duplicate race.
- Migration evidence: empty PostgreSQL 14 + pgvector replay applied all 60
  migrations; the previous upgrade replay preserved legacy pending resumes and
  applied the scan-delivery migration once followed by a no-op deploy.
- Consumer matrix: active platform resume consumers in ATS submission,
  autopilot/auto-apply, quick apply, talent views, RAG documents, and trust
  services query `isActive: true, securityStatus: "CLEAN"`. Pending/rejected
  uploads remain inactive.
- Terraform readiness: RDS proxy now consumes a privileged externally managed
  role ARN; the restricted deployment path no longer owns inline IAM policy.
  `terraform validate` passes with an isolated provider data directory.
- Verified finding: disabled local email delivery logged rendered email text,
  including verification URLs. Fixed in `beb3229` with a retained regression.
- Completed final local evidence: an isolated PostgreSQL-backed browser runtime
  passed Playwright API `16/16` and desktop `8/8`; Prisma
  format/validate/generate passed; backend full Vitest passed `107 files, 839
  tests` with `2 files/5 tests` explicitly skipped; frontend Jest passed `31
  suites, 142 tests`; both application builds and production dependency audits
  passed. Backend lint has 60 existing warnings and frontend lint has 71;
  neither has errors.
- Supply-chain evidence: reproducible CycloneDX SBOMs were generated from both
  frozen production dependency trees (backend 382 components, frontend 568)
  and from the exact final images (backend 11,792 components, frontend 265).
  The frontend runtime image has no HIGH/CRITICAL findings. The backend runtime
  image has 91 Debian 12 HIGH/CRITICAL findings, dominated by Chromium and
  chromium-common `151.0.7922.137-1~deb12u1`, with no Debian fixed version.
  Runtime npm/npx were removed; no application npm findings remain. Node 24
  and Node 22/trixie experiments did not provide a safe patched replacement.
- Terraform evidence: fmt and isolated-backend validate passed; TFLint passed;
  actionlint passed. Checkov found 160 policy findings and Trivy found public
  edge, HTTP-listener, mutable-ECR, unrestricted-egress, public-subnet and
  legacy module findings. Unambiguous repository fixes completed: encrypted
  operations SNS topics, externally managed RDS-proxy role input, and invalid
  ALB header dropping. Public edge/TLS and egress confinement require an
  approved architecture/certificate/egress-control decision; do not weaken
  application availability with arbitrary CIDR rules. No non-applying plan is
  trustworthy until an approved privileged proxy-role ARN is supplied.
- Scanner operational readiness: callback mode requires an explicit mode and
  a 32+ character secret in production/staging; disabled mode blocks new
  registration with 503 and leaves all resumes non-downloadable. The worker
  contract, version-pinned read scope, HMAC callback, backoff/DLQ, monitoring,
  historical backlog and incident pause are documented in
  `docs/ops/resume-scanner-worker-runbook.md`. A production worker remains an
  external deployment prerequisite.
- Security scans: Gitleaks is clean for `origin/main..HEAD`; Semgrep has one
  reviewed JSON-LD `dangerouslySetInnerHTML` finding protected by the existing
  escaping serializer and browser regression. Trivy filesystem and Checkov
  remain non-green for the explicit runtime/IaC architecture issues above; no
  ignore rules were added.
- Release decision: HOLD — architecture/shared authorization is required before
  review approval. Recommended image remediation is a separately maintained,
  scanned PDF/browser renderer (or a Lambda browser boundary); temporarily
  disable server-side PDF rendering only if product owners approve. Recommended
  egress remediation is centralized NAT plus egress firewall or authenticated
  proxy/domain-aware control; preserve public edge only with approved TLS/WAF
  configuration. Retain the Aurora cluster and use an externally provisioned
  proxy role; never apply or destroy from this branch.
- External/shared prerequisites: approved proxy-role ARN and read-only plan
  credentials; a platform choice for browser/PDF execution; an egress-control
  architecture plus public-edge certificate/WAF review; deployed scanner worker
  identity/secret injection; isolated preview/runtime validation. No shared
  action has occurred.
- Exact automatic resume step: obtain the three architecture approvals above,
  implement the selected renderer/egress design in a follow-up branch, rebuild
  and rescan the exact runtime images, then run a read-only Terraform plan.
