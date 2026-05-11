# Changelog

All notable changes to AfriTalent are recorded here in reverse-chronological
order, grouped by release. See `AfriTalent_Public_Launch_Master_Prompt.md` for
the wave plan driving these changes.

## Unreleased

### Removed

- **Apple Sign-In** — public-launch plan Wave 2. The Apple OAuth route handler,
  provider listing, frontend buttons and `/auth/apple/callback` page, Terraform
  SSM placeholder (`APPLE_CLIENT_ID`), and environment / documentation
  references have been removed end-to-end. `APPLE` is dropped from the
  `OAuthProvider` Prisma enum by migration
  `20260511120000_remove_apple_oauth_provider`, which refuses to run if any
  `OAuthAccount` rows still reference `APPLE`.

### Added

- `CHANGELOG.md` (this file).
