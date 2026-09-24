# packages/core/src/services/audit

The one place a `genie-ops` command writes an audit row.

## What belongs here

`writeAuditEvent`, the helper the command runner calls around every command (R-64, DEC-45): one
append-only `audit_event` row with a null actor, the `ops:<command>` action, and the
operating-system user, the allow-listed arguments and the outcome in `metadata`.

## What must not go here

A second writer of `audit_event`, a pool of its own, and any command-specific argument or
outcome shape. The helper takes the tenant context, never a pool, so the one context owns the
one connection (DEC-34).

## What it imports

The tenant-context type beside it. Nothing else.
