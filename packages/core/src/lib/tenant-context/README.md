# packages/core/src/lib/tenant-context

The `TenantContext` type: the one object every procedure, job and page reads through (DEC-34).

## What belongs here

The `TenantContext` type, its `DeploymentEnvironment` member, and, from S0-04, `createTenantContext()`.
It imports the Drizzle node-postgres types.

## What must not go here

A connection singleton, a settings read, a branding read, or any database access at import time.
Core exports no `db`, `settings`, `branding` or `storage` singleton (R-17).
