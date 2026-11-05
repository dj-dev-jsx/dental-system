#!/bin/bash
# Runs once, when the database volume is first created.
#
# Creates the limited login the API uses. Row-level security doesn't apply to superusers
# or table owners, so the API must never connect as POSTGRES_USER.
set -euo pipefail

psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE dental_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO dental_app;

-- Applies to every table the migrations create from now on: rows only, not structure.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dental_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
EOSQL
