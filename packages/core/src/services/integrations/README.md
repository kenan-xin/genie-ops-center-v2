# packages/core/src/services/integrations

The one service that resolves a `tenant_integration` for a call.

## What belongs here

`resolveIntegration`, which reads an integration row through the tenant context, returns its
non-secret configuration, and reads the live secret from the environment by the name in
`secret_ref` at each call (R-40, R-41, DEC-20). A credential is never written to the database and
never logged, and a missing environment entry fails with a message that names the reference, not
the value.

## What must not go here

A connector, an integration screen or page component (R-42), a credential stored anywhere, and
anything that reads the database outside the `TenantContext` object. Core lifts an integration
screen from a module only when a second module needs one.

## What it imports

The tenant-context type beside it, the `tenant_integration` table, and drizzle's `eq`. Nothing
else.
