# S3-03: Primitives and shared parts, replacing the core kit

Bead: `6wz1.5`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-02](../02-token-layers/index.md).
Beads folded into this ticket: none. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-19, R-19a, R-20 to R-26. Button, Input, Select, Dialog, Table with the phone card list, Toast, Switch, Tabs and the R-25 shared parts on Base UI. Switch People, Groups and Roles to them, delete packages/core/src/features/admin/ui.tsx, and add a lint check that refuses a second ConfirmDialog or focusRing (R-19a).

## Acceptance

AC-3.

The shared definition of done in the [index](../README.md) also applies.
