# S3-06: Tenant Settings and ConfigForm

Bead: `6wz1.8`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-04b](../04b-shell-chromes-and-behaviors/index.md).

Beads folded into this ticket: none. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-72 to R-80. R-75a search is deferred, and its permission rule stays.

- Tenant Settings with section navigation and the core sections.
- `ConfigForm` with the five field kinds from `configuration.schema`, and the placeholder schema (R-78).
- One audit event per save, with the keys from S3-04a. The validation rules, with refusals in the `AppError` `issues` shape (R-79). R-92 to R-95 apply to every screen of this ticket (R-93 server refusal, R-94 TanStack Query, R-95 can()).

## Acceptance

AC-10, and the settings part of AC-19.

The shared definition of done in the [index](../README.md) also applies.
