# S3-08: Sign-in branding, email templates and Keycloak pages at phone width

Bead: `6wz1.10`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-02](../02-token-layers/index.md).
Beads folded into this ticket: `6wz1.2`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-54 to R-59a. Sign-in page branding as text and color (R-54); five email templates on a typed branding object (R-59, R-59a), plain-text parts, PUBLIC_URL links, nothing written to the realm; phone and desktop check of Keycloak sign-in, set-password, reset-password and verify-email pages on the realm theme. Folds in 6wz1.2.

## Acceptance

AC-6, AC-12, AC-14; phone and desktop e2e of Keycloak local-account pages.

The shared definition of done in the [index](../README.md) also applies.
