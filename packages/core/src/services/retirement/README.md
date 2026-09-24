# packages/core/src/services/retirement

The retirement record and its `--confirm` refusal rules.

## What belongs here

`runRetire`, the work of `genie-ops retire` (R-69). Without `--confirm` it writes the single
`retirement` row with `retired_at` taken from the database clock and `deletion_hold` false, and
deletes nothing; a second run keeps the first row. With `--confirm` it refuses while fewer than 90
days have passed since `retired_at` (compared in SQL against `now()`, so a skewed container clock
cannot shift the guard) and while `deletion_hold` is set; otherwise it prints that the checks passed
and does nothing else — the deletion, the hold and personal erasure land in Section 5 item 7.

## What must not go here

The deletion itself, the placing of the hold, an audit write (the runner owns the one audit row),
and a connection of its own (it takes the tenant context, DEC-34).

## What it imports

The tenant-context type and the `retirement` table beside it.
