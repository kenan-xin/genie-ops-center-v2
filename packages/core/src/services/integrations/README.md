# packages/core/src/services/integrations

The one service that resolves a `tenant_integration` for a call, and the one store for a key an administrator typed.

## What belongs here

`resolveIntegration`, which reads an integration row through the tenant context, returns its
non-secret configuration, and reads the live secret from the environment by the name in
`secret_ref` at each call (R-40, R-41, DEC-20). Nothing is logged, and a missing environment entry
fails with a message that names the reference, not the value. The resolver does not refuse by
status: a `disabled` or `error` row still resolves, and the calling module decides whether to use
it.

`keys.ts`, the one reader and writer of `tenant_integration_key` (`DEC-53`, accepted risk). It
stores and removes a typed key as plain text in that core table, and its errors carry only the
Postgres code and constraint, never the key.

## What must not go here

A connector, an integration screen or page component (R-42), and anything that reads the database
outside the `TenantContext` object. Core lifts an integration screen from a module only when a
second module needs one.

## What it imports

The tenant-context type beside it, `withTransaction` for the key store, the `tenant_integration`
and `tenant_integration_key` tables, the admin audit writer, and drizzle's `eq` and `sql`.
