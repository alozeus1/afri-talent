# Bug Severity Rubric

## Severity Levels
| Severity | Definition | Examples | Release Policy |
|---|---|---|---|
| `P0 - Critical` | Data loss, account compromise, payment/security break, or complete outage of core flow | Auth bypass, webhook signature bypass, destructive data corruption, checkout charging wrong plan at scale | Immediate stop-ship. Hotfix required before release. |
| `P1 - High` | Core journey broken for a meaningful segment with no reasonable workaround | Candidate cannot apply, employer cannot post jobs, email verification always failing | Stop-ship unless explicit exec exception with mitigation. |
| `P2 - Medium` | Important but recoverable issue with workaround or limited blast radius | i18n route mismatch on one locale, analytics event missing non-critical property, intermittent skeleton flicker | May ship with owner, SLA, and rollback plan. |
| `P3 - Low` | Cosmetic/minor friction, low risk to conversion/trust | Copy inconsistency, non-blocking visual alignment, minor console warning | Can ship; fix in next sprint. |

## Priority Modifiers
- Promote one level if issue affects:
  - Payments/billing correctness
  - Security/privacy boundaries
  - Legal/compliance surfaces
  - First-time user conversion path
- Promote one level if no workaround exists.
- Demote one level only if impact is confined to non-prod or internal/admin tools.

## SLA Targets
| Severity | Triage SLA | Fix SLA |
|---|---|---|
| `P0` | 15 minutes | Same day / immediate |
| `P1` | 2 hours | 24 hours |
| `P2` | 1 business day | 3-5 business days |
| `P3` | 3 business days | Next planned iteration |

## Required Bug Report Fields
- Repro steps (deterministic)
- Expected vs actual behavior
- Environment and build SHA
- User role/plan/locale context
- Evidence (logs, screenshots, network traces)
- Severity with justification
- Owner + ETA
