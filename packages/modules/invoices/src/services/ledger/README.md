# src/services/ledger

The module's writes to its own tables.

## What belongs here

Each write of the module with its row locks, in the lock order (the customer row, then invoice
rows in id order, then the payment row, then allocation rows), its checks, its allocation events
and its audit rows, all on the caller's transaction. The write checks, which call `can()` and
`scopesFor()`.

## What must not go here

A read for a page, a dataset, a model call, and a permission check that is not `can()` or
`scopesFor()`.
