# S3-04b: Shell chromes and behaviors

Bead: `6wz1.12`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-04a](../04a-navigation-tree-and-migration/index.md).

Beads folded into this ticket: `1ri3`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-27, R-31, R-32, R-33, R-35, R-37 to R-42. Plan D3-5, D3-7.

- One shell in `packages/core` with two chromes that render the S3-04a tree (R-27). Category collapse per device (R-31).
- The user menu with the chrome switch (R-32, bead `1ri3`).
- The idle dialog inside `SessionActivity` (R-33). It inherits that component's mount condition: authenticated sessions only.
- The offline bar (R-35), the bottom-bar slot (R-37), the phone drawer (R-38).
- The branding read for the identity block (R-39). The logo loads through the signed download link, issued per render (D3-7).
- No bell and an empty search slot (R-40). The message catalogue for every shell string (R-41). The security headers (R-42).

## Acceptance

The shell parts of AC-4, and AC-4a. The composition outside `apps/genie` is a Storybook story in `apps/storybook` that composes the shell from `packages/core` and `packages/ui` only. Where AC-4 says the review confirms, record that as a review item in the bead, not as a test.

The shared definition of done in the [index](../README.md) also applies.
