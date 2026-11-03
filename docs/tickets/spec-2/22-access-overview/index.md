# S2-22: Access Overview tab

Bead: `d8l5.32`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37b, R-37d, R-37e and AC-28.
- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), R-29b: the Overview is a core screen and works when the Solutions module is off.
- The [Access design](../../../design/sections/access/spec.md), as S2-20 updates it.
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: S2-19 and S2-20.

## Scope

1. A read-only tab. The administrator chooses by group or person, or by module, then picks one subject. Nothing is read before that choice.
2. Searchable and paged results from the read of S2-19.
3. Each row names the holder, the module, the role, the path, and the person who added it. A row that is not in effect shows the reason.
4. Stories first, then the screen, then the end-to-end tests.

## Acceptance

The Overview part of AC-28 at a phone and a desktop viewport, by group, by person and by module. A caller without `core:roles:manage` is refused. The shared definition of done in the [index](../README.md) also applies.
