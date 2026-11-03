# S2-23: Advanced access

Bead: `d8l5.33`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37c, R-38 and AC-28. Open point U3: Advanced access offers a record scope only for a module with one record type that declares `search`, until U3 is answered.
- The [Access design](../../../design/sections/access/spec.md), as S2-20 updates it.
- [Decision log](../../../core/decision-log.md), `DEC-23` and `DEC-39`.
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: S2-21.

## Scope

1. Assign and remove core administration and the `Auditor` role.
2. A module role at a record scope.
3. Custom roles, bound to one module or to core as S2-18 records.
4. Every write goes through the same role-assignment service, and every removal calls the last-administrator check of R-38.
5. A link with a core role, `/admin/access?role=<id>`, opens Advanced access.
6. Stories first, then the screen, then the end-to-end tests.

## Acceptance

At a phone and a desktop viewport, an administrator assigns and removes each kind of role of the scope. The server refuses a removal that would leave no active holder of `Tenant administrator`. The shared definition of done in the [index](../README.md) also applies.
