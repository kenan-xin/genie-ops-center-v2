# S2-18: Access model in the module contract

Bead: `d8l5.28`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-33, R-33a, R-37a and AC-28, as the access amendments of 2026-11-02 changed them.
- [Module contract](../../../architecture/module-contract.md), the Default roles row (A6).
- [Data shape](../../../architecture/data-shape.md), "Roles and permissions", for the core system role `Ask user` (A7).
- [Decision log](../../../core/decision-log.md), `DEC-50` and `DEC-23`, amendment lines of 2026-11-02.
- [Technical plan](../../../tech-plans/02-identity-and-access.md), D2-7.
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: the amendments bead `cvij.2`, which writes the documents above. It needs no other open ticket. S2-19 and S2-21 depend on it.

## Scope

1. `validateModule` refuses a default role of a module with a workspace entry that does not carry `<id>:use`, with a named cause.
2. `validateModule` refuses a module with a workspace entry and no `defaultAccessRole`, with a named cause.
3. The four built modules declare their default access role: Invoices "Viewer", Analytics "Analytics editor", Slides "Slides editor", Placeholder "Placeholder user".
4. A custom role belongs to one module or to core, and a module custom role carries that module's use key. If `role.module_id` takes on that meaning, `data-shape.md` changes in the same commit.
5. Setup and `seedRoles` seed the core system role `Ask user` with `core:ask:use`. The seed inserts a missing role by name and never rewrites an existing role (R-33a).
6. `module-contract.md` matches what the code checks.

## Acceptance

The two `validateModule` refusals of AC-28, each proved by a unit test that fails on a module without the use key or without `defaultAccessRole`. An integration test proves that setup seeds `Ask user`. The shared definition of done in the [index](../README.md) also applies.
