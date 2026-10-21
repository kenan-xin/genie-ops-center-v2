# packages/core/src/__testing__

Helpers that core's own tests use.

## What belongs here

A helper that runs a real tool binary against an isolated fixture, so a test can prove what a
build target covers.

## What must not go here

A factory for a core table, a database helper, a migration helper, and a tenant-context helper.
Those belong in `packages/core/testing/`, which R-39 governs and a later ticket creates. Nothing
here is part of the package's public surface.

## What it imports

The Node standard library only.
