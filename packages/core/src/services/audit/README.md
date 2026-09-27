# packages/core/src/services/audit

The audit capability: the one command-line writer, the action catalogue, and the reader.

## What belongs here

- `writeAuditEvent`, the helper the command runner calls around every command (R-64, DEC-45): one
  append-only `audit_event` row with a null actor, the `ops:<command>` action, and the
  operating-system user, the allow-listed arguments and the outcome in `metadata`.
- `AUDIT_ACTIONS`, the one catalogue of action strings core writes (R-45), so the reader's action
  filter has a fixed list to group. A writer that already exists references it; the reader never
  invents an action.
- `readAuditPage` and `createAuditRouter`, the filterable, keyset-paged reader behind
  `core:audit:read` (R-67 to R-69, DEC-16). Free text searches stored columns only (`summary`,
  `target_type`, `target_id`), with `%`, `_` and the backslash escaped, never a resolved label; an
  audit writer puts the target's name in the summary. Each target resolves through the owning
  module's record-type resolver, and its live label, existence flag and path are kept only when the
  viewer may open the record under `can()` on the permission the resolver names (default
  `<id>:use`). A denied target and a removed one read the same: only the stored type and id.

## What must not go here

A second writer of `audit_event`, a pool of its own, and any command-specific argument or outcome
shape. The writer takes the tenant context, never a pool, so the one context owns the one
connection (DEC-34). The reader never writes a row and never edits one: the table is append-only.

## What it imports

The tenant-context type beside it, the schema, and the one authorization seam (`can`). Nothing else.
