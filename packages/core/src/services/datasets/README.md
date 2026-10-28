# packages/core/src/services/datasets

The dataset service: the registry of the datasets the compiled modules publish, and the query
rules core applies over them (DEC-54).

## What belongs here

The registry `registerModuleRuntime` fills from each module's `datasets` declaration, and the
generic query over a declaration's `source(ctx, asOf)`: listing and finding the datasets of
enabled modules, the browser-safe query shape and its check against the declared fields (zod and
types only), and the runner that composes the SQL with Drizzle's builder, with the permission
check, the row cap, the time limit, the money rule and the month, week and range buckets, and the route from a dataset row to its record page under
the page permission. Core
reads data only through the select a module's `source()` returns.

## What must not go here

A module table name or a module import: a dataset query composes only over the select `source()`
answers. A cache: the reporting date and the time zone come through the cached settings and
branding readers on the tenant context (`DEC-46`).
