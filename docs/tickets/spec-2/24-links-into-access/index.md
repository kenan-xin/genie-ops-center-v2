# S2-24: Links into Access

Bead: `d8l5.34`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 2](../../../specs/02-identity-and-access.md), R-37, R-37a (prefilled links) and R-37e (a link is hidden without `core:roles:manage`).
- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), R-29b, R-85 and AC-11.
- The [People, Groups and Roles design](../../../design/sections/people-groups-and-roles/spec.md) and the [Access design](../../../design/sections/access/spec.md).
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: S2-21.

## Scope

1. The admin navigation lists Access between Roles and Branding.
2. The People and Groups inspectors get a read-only Access tab (module, role, path) with "Manage in Access", through the kept `onOpenInAccess` seam.
3. The Roles page shows the holders of a role as a read-only count with a link to Access.
4. The Modules page links to `/admin/access?module=<id>`.
5. Each link preselects its subject in Access, and is hidden for a person without `core:roles:manage`.

Changed 2026-11-08 (`d8l5.46`): the Modules and Roles links open the Overview with the module or role chosen.

## Acceptance

At a phone and a desktop viewport, each link opens Access with its subject chosen. A person without `core:roles:manage` sees no link. Spec 3 AC-11 still passes for the Modules page. The shared definition of done in the [index](../README.md) also applies.
