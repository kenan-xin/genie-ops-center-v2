# S2-20: Access design update to the role-per-row model

Bead: `d8l5.30`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37 to R-37e and R-38.
- The current [Access design](../../../design/sections/access/spec.md), which still shows the model of 2026-09-18, and the [design README](../../../design/README.md) for the import steps.
- [Module contract](../../../architecture/module-contract.md), the Default roles row.
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: the amendments bead `cvij.2`. S2-21 and S2-22 depend on it.

## Scope

1. Update the Access prototype in the design workspace with the `impeccable` skill, on its own design branch.
2. Grants: the role choice on each Granted row, Add with the default access role, the Remove confirmation that names the roles and every path that stays, a switched-off module, and the Core group with Ask.
3. Overview by recipient and by module. Advanced access.
4. Phone and desktop captures of each state.
5. Import the prototype into `docs/design/sections/access/` with an import record and a `docs/design/CHANGELOG.md` entry, marked "owner review pending at the final dry run".

Owner, 2026-11-03: no stop for design approval. The owner reviews the design and the built Access screens together at the final dry run.

## Acceptance

The imported design shows every state of the scope at 390 and 1440 pixels. Its spec matches R-37a to R-37e, and no state contradicts them. The shared definition of done in the [index](../README.md) also applies.
