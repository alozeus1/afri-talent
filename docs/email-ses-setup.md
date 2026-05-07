# Email and SES Setup

AfriTalent email delivery covers password reset, verification, alerts, and lifecycle notifications.

## Required Variables

- `SES_REGION`
- `SES_FROM_EMAIL`

AWS runtime credentials should come from the App Runner task role or deployment environment. Do not place AWS access keys in `.env` files.

## Safety Rules

- Forgot-password responses remain generic and do not reveal whether an account exists.
- Reset tokens are never logged.
- Missing `SES_FROM_EMAIL` switches delivery to dev logging instead of crashing.
- Delivery success/failure is recorded as an ops event with recipient domain only.

## SES Checklist

- Verify the sending domain or address.
- Configure DKIM/SPF for the sending domain.
- Move SES out of sandbox before public launch.
- Add bounce/complaint handling before broad outbound campaigns.
