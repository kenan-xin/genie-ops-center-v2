# packages/core/src/services/job-queue

The job queue over pg-boss (D-11).

## What belongs here

The pg-boss construction over the context pool, and the `jobQueue` member of the tenant context
with `enqueue` and `schedule`.

## What must not go here

A second driver pool, a LISTEN/NOTIFY connection, and the worker's job loop, which lives in
`services/worker`.
