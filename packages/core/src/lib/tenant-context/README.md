# packages/core/src/lib/tenant-context

The `TenantContext` type: the one object every procedure, job and page reads through (DEC-34).

## What belongs here

The `TenantContext` type, its `DeploymentEnvironment` member, and, from S0-04, `createTenantContext()`.
It imports the Drizzle node-postgres types.

The factory owns the pool's two error listeners: a per-client one for a checked-out client, and a
pool-level one for an idle client pg-pool has dropped. The pool-level one records the failure
through the deployment's redacting logger; neither listener exits a serving process.

## What must not go here

A connection singleton, a settings read, a branding read, or any database access at import time.
Core exports no `db`, `settings`, `branding` or `storage` singleton (R-17).
