# packages/core/src/services/job-queue

The job queue over pg-boss (D-11).

## What belongs here

The pg-boss construction over the context pool, the `jobQueue` member of the tenant context
with `enqueue` and `schedule`, and the module job helpers: `enqueueJob`, the retry options of a
declaration, and the reserved starter key that the worker reads back.

## What must not go here

A second driver pool, a LISTEN/NOTIFY connection, and the worker's job loop, which lives in
`services/worker`.
