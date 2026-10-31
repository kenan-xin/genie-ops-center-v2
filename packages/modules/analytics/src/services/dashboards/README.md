# src/services/dashboards

The module's reads and writes of its own `dashboard` table.

## What belongs here

The permission checks of a dashboard procedure, which call `can()` with no resource, and the
owner-only reads and writes: every query filters on the caller's own user id, so another person's
dashboard answers as missing (R-48). The pure helpers that change a stored config, and the
dashboard filters that a panel's query gets before it runs through core's chart gate (R-49).

## What must not go here

A page component, a direct read of another module's tables, a dataset query that does not go
through core, and a permission check that is not `can()` or `scopesFor()`.
