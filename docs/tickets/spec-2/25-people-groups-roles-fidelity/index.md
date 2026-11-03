# S2-25: People, Groups and Roles fidelity pass

Bead: `d8l5.35`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37 (the screens render as the design specifies) and R-24c (group labels).
- The [People, Groups and Roles design](../../../design/sections/people-groups-and-roles/spec.md) and its captures.
- [UI development](../../../architecture/ui-development.md).
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: nothing. It needs no Access work, so it runs first in wave 5.

## Scope

1. Compare every People, Groups and Roles screen with its mockup at 390 and 1440 pixels, and list the gaps.
2. Fix every gap that does not depend on Access. The known gaps:
   - The People list shows raw group ids instead of group names. Find the cause and fix it there.
   - The inspector tabs have no intro lines.
   - The "n of n people" footer with the onboarding line is missing.
   - Sign-in times are not relative.
3. Record one capture pair per screen.

## Acceptance

Each gap of the list is fixed or named as one that depends on Access. A test proves that the People list shows the group name or label, and fails on the raw id. One capture pair exists per screen. AC-28 does not cover this ticket. The shared definition of done in the [index](../README.md) also applies.
