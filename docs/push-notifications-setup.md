# Push Notifications Setup

Browser push is optional for early access. Email and in-app preferences continue to work when push is not configured.

## Required Variables

- `WEB_PUSH_VAPID_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

Generate keys with:

```bash
npx web-push generate-vapid-keys
```

## Runtime Behavior

- The frontend checks `/api/push/vapid-public-key` before showing enable controls.
- If the public key is missing, the UI says browser push is being configured and hides the broken enable action.
- Existing relevance protections must remain active: strict score thresholds, target role/title filtering, and spacing/flood prevention.

## Validation

- Confirm the notification bell still loads in-app notifications.
- Confirm email/in-app alert preferences remain editable without push keys.
- Confirm push subscription creation only works after VAPID keys are configured.
