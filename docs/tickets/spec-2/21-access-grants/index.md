# S2-21: Access Grants tab

Bead: `d8l5.31`. Status and claims live in Beads, not in this document. The closed bead `d8l5.20` carries an older title that starts with "S2-21". It is a different ticket.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37, R-37a, R-37d, R-38 and AC-28.
- The [Access design](../../../design/sections/access/spec.md), as S2-20 updates it.
- [Module contract](../../../architecture/module-contract.md), the Default roles row.
- [UI development](../../../architecture/ui-development.md).
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: S2-18, S2-19 and S2-20. S2-23 and S2-24 depend on it.

## Scope

1. The recipient picker: groups, and people as the exception.
2. The Catalog and Granted transfer list, grouped Modules and Core. The Core group holds Ask.
3. Add assigns the module's default access role. The role choice on each Granted row swaps the role.
4. Remove takes every role of that module from the recipient, after a confirmation that names the roles and every path that stays.
5. The last-administrator guard of R-38, on the server and mirrored in the screen.
6. A switched-off module takes no new grant, keeps its grants, shows the reason, and keeps Remove.
7. Every write goes through the one role-assignment service.
8. Stories first, then the screen, then the end-to-end tests.

## Acceptance

The Grants part of AC-28 at a phone and a desktop viewport. A module granted to a group appears in the sidebar of a member of that group. Remove makes it disappear, unless another path stays. The shared definition of done in the [index](../README.md) also applies.
