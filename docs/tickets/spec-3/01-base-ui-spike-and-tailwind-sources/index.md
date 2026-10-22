# S3-01: Base UI spike and app Tailwind sources

Bead: `6wz1.3`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: none.
Beads folded into this ticket: `crg7`, `ghe`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-19b, R-19c. Set up shadcn on Base UI in packages/ui (components.json, @base-ui/react) and record the result in docs/core/tech-stack.md. Make the app build compile Tailwind classes from packages/ui, packages/core and each selected module, selection-aware like apps/storybook/.storybook/module-tailwind-sources.ts. Folds in crg7 and ghe.

## Acceptance

AC-3 spike checks; built CSS holds classes from packages/ui, packages/core and each selected module, none from excluded modules.

The shared definition of done in the [index](../README.md) also applies.
