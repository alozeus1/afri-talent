# SMS Verification Setup

Phone verification uses one-time passcodes through Africa's Talking when configured.

## Required Variables

- `AT_USERNAME`
- `AT_API_KEY`
- `AT_SANDBOX`
- `AT_SENDER_ID`
- `SMS_ENABLED`
- `TEST_SMS_OTP_PREVIEW`

## Runtime Behavior

- OTP codes expire after 10 minutes.
- Resend is blocked for 60 seconds after a pending challenge.
- Verification is limited to five failed attempts.
- Phone numbers are masked in API responses and operational logs.
- Production/staging without SMS credentials returns a safe `sms_provider_unconfigured` response.

## Dev/Test Mode

In local development, if SMS is not configured, OTP delivery is logged and `previewCode` can be returned for browser tests when `TEST_SMS_OTP_PREVIEW=1`. Do not enable this flag in production.

## Deployment Secrets

Store Africa's Talking credentials in GitHub Actions or AWS Secrets Manager for staging/production. Keep `AT_SANDBOX=true` outside production unless the production sender has been approved.
