# packages/core/src/services/authorization

The one authorization seam in the platform.

## What belongs here

`can()` and `scopesFor()`, the request-owned principal with its lazy grant read and its
per-resource parent cache, the real grant reader and its one assignment query, the core permission
keys and system roles with their seeding, the module admin-key append and removal, and the
permission transformations the migrator run applies. Every permission check and every list-query
scope filter in the platform routes through `can()` or `scopesFor()` here (DEC-39).

## What must not go here

A test principal, a bypass other than the unlimited break-glass account (R-30), a cache that
outlives one request or job run (DEC-48), and a role editor or assignment writer; those belong to
the roles administration. A second permission check anywhere else in the codebase is a defect.

## What it imports

The key primitives and types from `lib/module-contract`, the tenant context type, and the core
schema. Nothing from `apps/` and nothing from `packages/modules/`.
