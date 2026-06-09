# Status Page Setup — `status.afri-talent.com`

**Scope:** one-time founder setup to bring up the public status page at `status.afri-talent.com`.
**Wave:** 9 §10.2.
**Owner:** founder (alozeus1@gmail.com).
**Estimated time:** 30 minutes (account creation + DNS).

This runbook is the **only** documentation needed to turn on the status page. Code-side wiring is already in place: an empty `var.status_page_cname` keeps the DNS slot dormant; setting it activates the CNAME at `status.<domain_name>`.

---

## 1. Pick a provider

Two recommended options, both have a free or cheap entry tier and integrate with CloudWatch / Sentry / email:

| Provider | Free tier | Notes |
|---|---|---|
| **instatus.com** | yes (1 status page, basic features) | Fast UI, simple CNAME setup. Recommended for v1. |
| **statuspage.io** (Atlassian) | paid only (~$29/mo) | Enterprise-flavored, deeper integrations. Use if Atlassian-shop standardization matters. |

Founder picks one; the rest of this runbook works for either.

---

## 2. Create the account

1. Sign up at `https://instatus.com` (or `https://statuspage.io`) with `alozeus1@gmail.com`.
2. Create a status page named `AfriTalent`.
3. The provider gives you a default subdomain like `afritalent.instatus.com` or `afritalent.statuspage.io`. **Copy this hostname** — you'll plug it into Terraform in step 4.

---

## 3. Define the components

Match these to the SLO surfaces we already alarm on (see `modules/observability/alarms.tf`):

- **Web app** (CloudFront + frontend) — corresponds to SLO #1 + the frontend ECS service
- **API** (backend `/api/*`) — corresponds to SLO #1, #2
- **AI agents** (Match Agent, Apply Agent, Job-field classifier) — corresponds to SLO #3, #4, #5
- **Job ingestion** (worker → stale-job removal) — corresponds to SLO #6
- **Billing webhooks** (Stripe + Flutterwave Lambda Function URLs) — non-SLO but customer-visible

---

## 4. Wire the CNAME

In `infra/terraform/accounts/dev-new/terraform.tfvars` (or via the prod stack's tfvars when §9.1 lands), add:

```hcl
status_page_cname = "afritalent.instatus.com"  # or .statuspage.io
```

Then push to `develop` → promote to `main`. The deploy.yml apply step creates the CNAME at `status.<domain_name>` pointing at the provider.

**Constraint:** this only activates when `var.domain_name` is non-empty (i.e., after the DNS cutover from DigitalOcean to Route 53). Until then, the slot is intentionally dormant.

If the cutover hasn't happened yet, founder can manually add a CNAME at the current DNS provider (DigitalOcean) pointing `status.afri-talent.com` at the provider's hostname. The Terraform record is only needed once Route 53 is authoritative.

---

## 5. Wire CloudWatch alarms → status page

Both providers can subscribe to an SNS topic. The SLO alerts topic ARN is exposed as `output.slo_alerts_topic_arn` (see `accounts/dev-new/outputs.tf`).

1. In the provider UI, find the **CloudWatch / AWS SNS integration** section.
2. Subscribe the status-page provider to `arn:aws:sns:us-east-1:108188564905:afritalent-dev-slo-alerts` (or whatever `terraform output slo_alerts_topic_arn` returns).
3. Map each alarm name to a component:
   - `afritalent-dev-slo-api-5xx-rate` → API
   - `afritalent-dev-slo-api-latency-p95` → API
   - `afritalent-dev-slo-match-agent-p95` → AI agents
   - `afritalent-dev-slo-apply-delivery-rate` → AI agents
   - `afritalent-dev-slo-classifier-accuracy` → AI agents
   - `afritalent-dev-slo-stale-job-removal-latency` → Job ingestion

Now when an alarm fires, the relevant component goes from Operational → Degraded automatically. Founder can override manually for non-alarm incidents (e.g., a planned maintenance window).

---

## 6. Subscribe customers

In the provider settings, enable:
- **Email subscriptions** — public form on the status page
- **RSS / Atom** — for automation-friendly subscribers
- **Slack** — for internal/founder Slack workspace

---

## 7. Test it

1. Visit `https://status.afri-talent.com` — should load the provider page with all components Operational.
2. Trigger a synthetic alarm: `aws cloudwatch set-alarm-state --alarm-name afritalent-dev-slo-api-5xx-rate --state-value ALARM --state-reason "drill" --region us-east-1`.
3. Confirm the API component flips to Degraded within ~1 minute.
4. Reset: `aws cloudwatch set-alarm-state --alarm-name afritalent-dev-slo-api-5xx-rate --state-value OK --state-reason "drill complete" --region us-east-1`.
5. Confirm component returns to Operational.

---

## 8. Founder action checklist

- [ ] Create instatus.com (or statuspage.io) account, name page `AfriTalent`.
- [ ] Note the provider-supplied CNAME hostname.
- [ ] Add the 5 components listed in §3.
- [ ] Set `status_page_cname` in `accounts/dev-new/terraform.tfvars` (after DNS cutover), or manually CNAME at DigitalOcean.
- [ ] Subscribe the provider to the SNS topic and map alarms to components.
- [ ] Enable email + RSS + Slack subscriber channels.
- [ ] Run the drill in §7.
- [ ] Add `https://status.afri-talent.com` link to the website footer.

---

## 9. References

- `infra/terraform/modules/observability/alarms.tf` — alarm definitions
- `infra/terraform/accounts/dev-new/dns.tf` — CNAME record (gated on `var.status_page_cname`)
- Master prompt §10.2, §10.4
