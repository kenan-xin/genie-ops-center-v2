# packages/modules/placeholder/testing

The module's own test helpers.

## What belongs here

Factories for this module's tables, and the real-database integration tests of its router and its schema. A module owns the factories for its own tables; core holds none of them (R-39).

## What must not go here

A unit test, which lives beside its source under `src/`. A core table factory. A database mock: every test here takes a disposable Postgres with the real migration histories applied.

## What it imports

The module's own source, the core test helpers, and `@genie/core`.
