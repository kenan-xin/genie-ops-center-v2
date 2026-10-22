# S3-05: Modules and Categories pages

Bead: `6wz1.7`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-04b](../04b-shell-chromes-and-behaviors/index.md).

Beads folded into this ticket: `4xz`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-81 to R-91a, except R-84b (moved to Section 5) and R-86a (S3-04a).

- The Modules page with the shared enable procedure for the page and `genie-ops module enable|disable`. The enable refusal half of the first-enable sequence (R-84a). The Access column. The category picker.
- The Categories page with whole-module assignment. This ticket writes its own R-90a audit events. The keys exist from S3-04a.
- Bead `4xz` carries the refusal codes through the RPC error envelope, with the `issues` field from S3-04a. R-92 to R-95 apply to every screen of this ticket (R-93 server refusal, R-94 TanStack Query, R-95 can()).

## Acceptance

AC-11, and the whole-module part of AC-19. AC-11b moved to S3-09, because it needs the S3-06 save path.

The shared definition of done in the [index](../README.md) also applies.
