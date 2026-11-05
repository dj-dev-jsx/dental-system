#!/bin/bash
# A separate database for automated tests, so they can never touch development data.
# Default privileges belong to one database, so the app login's access is repeated here.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
CREATE DATABASE dental_clinic_test;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname dental_clinic_test <<'EOSQL'
GRANT USAGE ON SCHEMA public TO dental_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dental_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
EOSQL
