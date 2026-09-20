# packages/core/src/services/authorization

The one authorization seam in the platform.

## What belongs here

`can()` and `scopesFor()`, the request-owned principal that carries the lazy grant read, and the
Section 0 stub grant reader that grants only `placeholder:read`. Every permission check and every
list-query scope filter in the platform routes through `can()` or `scopesFor()` here (DEC-39).

## What must not go here

A real role evaluator, a role-table or database read, and any bypass or test principal. Those arrive
with Section 2 behind the `GrantReader` type; nothing here may open a connection or read a
deployment environment value. A second permission check anywhere else in the codebase is a defect.

## What it imports

The key primitives from `lib/module-contract`. Nothing from `apps/`, nothing from
`packages/modules/`, and no runtime dependency beyond that.
