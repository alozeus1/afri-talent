# Wave 4 — Founder Action Checklist

The apply pathway (Wave 4) has several external dependencies with **long lead
times**. Start these in parallel with the code work in PR N–V so they're
ready when the matching adapter ships.

Code-side: see the master prompt §5 and the PR roadmap on each Wave 4 PR.

---

## Long lead-time items (start NOW)

### 1. Greenhouse — Harvest v3 partner program
**Lead time:** 2–6 weeks.
**Why:** Track A (PR S) ATS_API_GREENHOUSE adapter needs partner API access.
v1/v2 are deprecated 31 Aug 2026 — we MUST be on v3.
**Action:**
- Apply at <https://developers.greenhouse.io/partners.html>.
- Request: "Partner write access for job submission via Harvest v3, OAuth2
  Authorization Code flow".
- Mention the integration: candidate-side apply automation against employer
  Greenhouse boards.
**Landing spot:** OAuth tokens per employer; SSM path
`/afritalent/prod/greenhouse/{employerId}/{access_token,refresh_token}`.

### 2. Lever — Partner API
**Lead time:** 2–4 weeks.
**Why:** Track A ATS_API_LEVER adapter.
**Action:**
- Apply at <https://help.lever.co/hc/en-us/articles/360042364732>.
- Specify OAuth2 + posting-submission scopes.
**Landing spot:** SSM `/afritalent/prod/lever/{employerId}/access_token`.

### 3. Ashby — Partner submission endpoints
**Lead time:** 2–8 weeks (newer ATS, less established partner program).
**Why:** Track A ATS_API_ASHBY adapter.
**Action:**
- Email <integrations@ashbyhq.com> requesting partner integration for
  apply-side submission.
- Provide AfriTalent use-case + projected volume.
**Landing spot:** SSM `/afritalent/prod/ashby/{employerId}/api_key`.

### 4. Workable — Hire API (write access)
**Lead time:** 4–8 weeks.
**Why:** Track A ATS_API_WORKABLE adapter. The public Job Board API is read-only;
write needs the partner Hire API.
**Action:**
- Apply at <https://workable.com/partners> for Hire API write access.
**Landing spot:** SSM `/afritalent/prod/workable/{employerId}/api_key`.

---

## AWS / SES (start when PR Q is ~3 days out)

### 5. SES domain identity for `mail.afri-talent.com`
**Lead time:** 1–2 days (DNS propagation).
**Why:** Track B (PR Q) EMAIL_DRAFT track uses SES as the candidate's apply email.
**Action:**
- In SES (us-east-1):
  1. Verify domain `mail.afri-talent.com` (sending) + DKIM (CNAMEs).
  2. Set up DMARC record: `v=DMARC1; p=quarantine; rua=mailto:dmarc@afri-talent.com`.
  3. Set up SPF: `v=spf1 include:amazonses.com -all`.
  4. Request SES production access (out of sandbox). 50k emails/day initial.
- Inbound rule for `inbox.afri-talent.com`:
  - Create a separate SES inbound receipt rule set.
  - MX record → `inbound-smtp.us-east-1.amazonaws.com`.
  - Rule action: invoke Lambda `apply-inbound-handler` (ships in PR Q backend).
**Landing spot:** SSM `/afritalent/prod/ses/{from_domain,reply_to_domain}`.

### 6. Anthropic Computer Use access
**Lead time:** 1–2 weeks.
**Why:** Track C (PR T) OPERATOR_HANDOFF needs Computer Use API access.
**Action:**
- Request via Anthropic console → Capabilities → Computer Use.
- Need: dedicated org with computer-use scope, budget alert at $200/mo while
  in beta.
**Landing spot:** SSM `/afritalent/prod/anthropic/computer_use/{api_key,org_id}`.

---

## Infrastructure (PR T)

### 7. ECS Fargate task: `apply-operator-worker`
**Lead time:** 1 day post-Computer Use approval.
**Why:** Track C operator runs in an isolated sandboxed Chromium task.
**Constraints from master prompt §5.5:**
- No inbound traffic.
- Ephemeral storage; KMS-encrypted disk.
- Isolated VPC subnet (separate from the main cluster).
- Max 5 minutes / session, max 200k tokens, max $0.80 / session.
**Action:** ships as Terraform module under `infra/terraform/modules/apply-operator-worker/`
in a later PR (after #80 pgvector + this checklist's item 6 land). I'll write
the TF; founder reviews + `terraform apply`.

---

## Status tracking

Founder maintains the live status of each item below. Update this file as
items land.

| Item | Status | Notes |
|---|---|---|
| Greenhouse partner application | _not started_ | |
| Lever partner application | _not started_ | |
| Ashby partner application | _not started_ | |
| Workable Hire API application | _not started_ | |
| SES domain `mail.afri-talent.com` | _not started_ | |
| SES inbound `inbox.afri-talent.com` | _not started_ | |
| SES production access (out of sandbox) | _not started_ | |
| Anthropic Computer Use access | _not started_ | |
| `apply-operator-worker` Fargate task | _not started_ | TF ships with PR T |

---

## Cost ceilings (for budget alarms)

| Service | Monthly ceiling |
|---|---|
| SES (50k emails/day) | $100/mo at full volume |
| Anthropic Computer Use beta | $200/mo |
| Greenhouse / Lever / Ashby / Workable APIs | partner-tier free |
| `apply-operator-worker` Fargate compute | $50/mo (capped via session limits) |

Set CloudWatch + Anthropic console budget alerts before flipping any feature
flag from off → on.
