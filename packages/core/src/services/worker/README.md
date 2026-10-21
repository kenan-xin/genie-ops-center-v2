# packages/core/src/services/worker

The worker process: `runWorker`.

## What belongs here

The worker start (one tenant context, the migrator run, then pg-boss), the per-queue loop that
checks module entitlement before it fetches a job, and the core heartbeat job (D-10, D-11).

## What must not go here

A module's job handler, a second connection pool, and an HTTP listener. The worker serves no
HTTP; its health is the heartbeat file.
