# S3-09: Section 3 acceptance

Bead: `6wz1.11`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-05](../05-modules-and-categories-pages/index.md), [S3-06](../06-tenant-settings-and-configform/index.md), [S3-07](../07-branding-page/index.md), [S3-08](../08-sign-in-emails-and-keycloak-pages/index.md).

Beads folded into this ticket: none. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-65 to R-70, R-92 to R-95. The page tickets build these, and this ticket proves them together. R-63, R-64 and AC-8 are part of every ticket's definition of done. R-62 needs no Section 3 work, because Spec 02 R-66 meets it, and R-71 is dropped.

- The accessibility proofs (R-65 to R-70) and reduced motion.
- AC-11b, first enable: a compiled test module with a required value is refused, the administrator saves a valid value through Tenant Settings, and the enable then succeeds.
- Rerun AC-12 to AC-19 through the pages, after all page tickets.
- AC-19a structure checks. The inline-string check uses the catalogue coverage test seam in `apps/genie/src/i18n/catalogue-coverage.ts`.
- The final anti-slop scan of every Section 3 story. Close epic 6wz1.

## Known limits

These limits come from DR-15 (2026-10-25). They are recorded here, not closed.

- The Keycloak axe check filters to serious and critical findings. Keycloak fixes are limited to settings and built-in themes (owner, 2026-10-22).
- The dark and keyboard sweeps cover first views only. Dialogs and tabs rely on their stories.

## Acceptance

AC-9, AC-11b, AC-12 to AC-19 rerun through the pages, AC-19a, and gate S3-G3.

The shared definition of done in the [index](../README.md) also applies.
