# TRUST & SAFETY ROLLOUT PLAN

## Phase 1: Internal readiness
- Validate trust scoring thresholds on staging data.
- Seed admin users and verify trust queue workflows.
- Test OTP generation in non-production mode.
- Confirm document upload paths, file sizes, and MIME validation.
- Review moderation reason codes with operations stakeholders.

## Phase 2: Silent backend rollout
- Enable trust scoring and event logging first.
- Keep badge display limited while collecting baseline metrics.
- Record but do not enforce some medium-risk cases initially.
- Compare false-positive patterns on staging and early production traffic.

## Phase 3: Progressive product enforcement
- Turn on employer posting gate for minimum trust threshold.
- Turn on auto-hold for clear fee-scam and off-platform patterns.
- Turn on candidate application hold for extreme spam velocity.
- Expose trust badges in jobs, dashboards, and talent search.

## Phase 4: Admin operations hardening
- Train reviewers on evidence standards and escalation criteria.
- Define SLAs for:
  - employer verification
  - candidate verification
  - severe scam reports
  - suspension appeals
- Add daily queue review and weekly threshold review rituals.

## Phase 5: Premium and reputation expansion
- Enable premium employer verified-candidate filtering broadly.
- Use trust quality as a weighting signal in search and ranking later.
- Add additional evidence integrations when needed:
  - third-party ID verification
  - telco-grade phone verification
  - business registry APIs

## Launch checklist
- Backend routes deployed and typechecked
- Frontend trust pages reachable from nav and dashboards
- Admin trust page operational
- Docs shared with support and moderation teams
- Rollback strategy agreed for:
  - overly strict employer posting gate
  - noisy content auto-holds
  - OTP delivery failure

## Rollback strategy
- Lower enforcement to observe-only mode for non-critical risk rules.
- Preserve all trust logs and cases even if badge display is temporarily hidden.
- Keep hard blocks only for explicit scam markers:
  - fee language
  - impersonation
  - extreme spam
