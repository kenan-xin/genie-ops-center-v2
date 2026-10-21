# packages/core/src/services/event-bus

The typed event bus: `emit` and `on` on the tenant context (R-53).

## What belongs here

The bus itself, its queue-naming rules, and the worker-facing view of durable subscriptions.
`emit` runs inside `withTransaction`: fast handlers join that transaction's after-commit list,
durable handlers are pg-boss jobs sent inside the caller's transaction (D-5), and a serialized
subscription's queue runs `key_strict_fifo` with the key as `singletonKey` and a dead-letter
queue created before reference (R-56, R-57).

## What must not go here

The event contracts and the envelope type (`packages/core/contracts`), the after-commit list
(`lib/tenant-context/with-transaction.ts`), and the pg-boss instance itself
(`services/job-queue`), which this service shares rather than owns.
