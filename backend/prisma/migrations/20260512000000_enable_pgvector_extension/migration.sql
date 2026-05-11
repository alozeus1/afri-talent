-- Wave 3 §12.1 — enable pgvector on Aurora.
--
-- This is a standalone migration so every subsequent embedding migration (and
-- ad-hoc runtime queries against vector columns) can assume the extension is
-- present. Idempotent.
--
-- Aurora PostgreSQL 15+ ships pgvector. Aurora's default `postgres` user is in
-- the `rds_superuser` role and is permitted to run CREATE EXTENSION for the
-- vendor-allowed list (which includes vector). If this migration ever fails
-- with permission errors, the operator must grant `rds_superuser` or run the
-- statement out-of-band as the cluster master user.

CREATE EXTENSION IF NOT EXISTS vector;
