# Internal PDF renderer

This is an internal-only renderer for sanitized resume-template HTML. It accepts
only an exact-body HMAC-authenticated `POST /render` request from the backend;
it never accepts a URL, object key, user identity, or browser argument.

Deploy it only in private subnets behind service discovery. Require a dedicated
security group, read-only root filesystem, dropped capabilities, no-new-
privileges, bounded CPU/memory/processes/concurrency, and no general internet
egress. The renderer has no database credentials and must not persist input or
output.

Chromium currently requires `--no-sandbox` in the Fargate container model.
That residual risk is intentional and requires a time-limited exception if the
image scan has unfixed HIGH/CRITICAL CVEs. Do not enable production PDF export
until the renderer image, runtime controls and exception are approved.
