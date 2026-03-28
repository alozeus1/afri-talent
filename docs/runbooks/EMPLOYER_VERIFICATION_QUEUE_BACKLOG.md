# Runbook: Employer Verification Queue Backlog

## Trigger

- `employer_verification_queue_backlog` exceeds threshold
- SLA breach risk for employer onboarding

## Immediate Actions

1. Check queue composition by age and priority.
2. Separate high-trust/high-value employers from suspicious or incomplete submissions.
3. Reassign reviewers or extend review coverage.

## Diagnose

- Pending vs needs-more-info mix
- Any document validation failure pattern
- Any correlated upload or email delivery issue blocking resolution

## Mitigate

- Batch-resolve low-risk items.
- Pause lower-priority intake if necessary.
- Use templated requests for missing information to clear incomplete cases quickly.

## Exit Criteria

- Queue below threshold
- Oldest pending item within target SLA

