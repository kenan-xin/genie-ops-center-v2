# S3-03: Primitives and shared parts, replacing the core kits

Bead: `6wz1.5`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-02](../02-token-layers/index.md).

Beads folded into this ticket: none. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-19, R-19a, R-20 to R-26. Plan D3-4.

- Button, Input, Select, Dialog, Table with the phone card list, Toast, Switch, Tabs and the R-25 shared parts on Base UI. Take each from the official shadcn registry first ([UI component sources](../../../architecture/ui-component-sources.md)).
- Delete `packages/core/src/features/admin/ui.tsx` and the kit half of `packages/core/src/features/audit/helpers.ts` (`focusRing`, `btnSecondary`).
- Switch every screen that imports a kit: People, Groups, Roles, Audit, Account and Break-glass.
- Add the lint check of R-19a that refuses a second `ConfirmDialog` or `focusRing`.

## Acceptance

AC-3, primitives part.

The shared definition of done in the [index](../README.md) also applies.
