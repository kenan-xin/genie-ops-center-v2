# packages/modules/invoices/testing

The module's own test helpers.

## What belongs here

Factories for this module's tables, and the real-database integration tests of its schema
constraints and, as they arrive, its router. A module owns the factories for its own tables;
core holds none of them (R-39). Every integration case is named in `required-tests-guard.ts`.

## What must not go here

A unit test, which lives beside its source under `src/`. A core table factory. A database
mock: every test here takes a disposable Postgres with the real migration histories applied. A
faked permission answer or a test-only principal: a granted caller holds a real role assignment
and is read by the real evaluator.

## What it imports

The module's own source, the core test helpers, and `@genie/core`.
