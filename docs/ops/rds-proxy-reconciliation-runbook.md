# RDS Proxy reconciliation runbook

This runbook prepares the failed `dev-new` reconciliation only. It does not
authorize an apply, database migration, proxy replacement, or Aurora deletion.

1. A privileged platform/IAM workflow provisions a dedicated role trusted only
   by `rds.amazonaws.com`, scoped to the selected Aurora credential secret and
   its KMS key (`GetSecretValue`, `DescribeSecret`, and constrained `Decrypt`).
2. Record the approved role ARN in the protected Terraform variable
   `rds_proxy_role_arn`; never place credentials or inline policies in the
   application deployment workflow.
3. Inspect the existing proxy and Aurora target health. Reconcile a suspended
   proxy and attach the existing Aurora cluster only after platform approval.
4. Verify the role can read the secret, use the KMS key through Secrets
   Manager, and that proxy subnets/security groups reach the Aurora writer.
5. Run `terraform fmt -check`, `terraform validate`, then a reviewed plan with
   the approved role ARN. Reject any Aurora replacement/destruction, security
   group/KMS/secret deletion, or IAM inline-policy action.
6. Obtain explicit approval and apply through the privileged, audited path.
7. Run database migrations as a controlled one-off task only after the proxy
   target is healthy; do not rely on a failing service startup to repair state.
8. Deploy one backend task, verify migration status, health, scanner-mode
   readiness, and callback authentication, then scale deliberately.
9. Inspect partial resources, target health, and cost allocation tags before
   increasing desired count. Keep deletion protection enabled.
10. To roll back, stop promotion and restore the previous task definition; do
    not delete Aurora, proxy, secret, KMS key, or verified data as rollback.
