# packages/core/testing

The generic test helpers every integration test starts from.

## What belongs here

A disposable Postgres with the real migration histories applied in the order the image applies them, tenant-context construction for a test, and factories for core's own tables. A core table gets its factory in the section that creates it, so Section 0 adds none.

## What must not go here

An import of a module, a module's factory, and any composition that knows which modules a deployment includes. A module owns its own factories, and the app harness composes them with these helpers (R-39). No database mock: a test here takes a real Postgres.

## What it imports

Testcontainers, the core migrator and the tenant-context factory beside it.
