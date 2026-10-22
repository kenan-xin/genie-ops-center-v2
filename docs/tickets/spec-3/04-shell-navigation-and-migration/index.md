# S3-04: Shell, navigation tree and the Section 3 migration

Bead: `6wz1.6`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-03](../03-primitives-and-shared-parts/index.md).
Beads folded into this ticket: `1ri3`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-27 to R-42 (R-36 moved to Section 4), R-86a. One shell, two chromes; navigation tree from entitlements, can() and category rows (static entries only, R-29, R-29a); landing route reuses landingRoute (R-30); user menu with the chrome switch; idle dialog inside SessionActivity (R-33); empty state, offline bar, bottom-bar slot, phone drawer; branding read for the identity block; no bell and an empty search slot (R-40); message catalogue (R-41); security headers (R-42). Includes the R-86a migration (category, user_preference, foreign key with orphans set to null). Folds in 1ri3.

## Acceptance

AC-4, AC-4a, AC-11a.

The shared definition of done in the [index](../README.md) also applies.
