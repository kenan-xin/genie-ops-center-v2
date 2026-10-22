# S3-08: Sign-in branding, email templates and Keycloak pages

Bead: `6wz1.10`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-02](../02-token-layers/index.md).

Beads folded into this ticket: `6wz1.2`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-54 to R-59a.

- Sign-in page branding as text and color (R-54). The page keeps its markup and gains only the branding read, so this ticket does not depend on the S3-03 primitives.
- The five email templates on a typed branding object (R-59, R-59a), with plain-text parts and `PUBLIC_URL` links. Nothing is written to the realm.
- Tests write the branding row through the end-to-end seed, because Publish arrives in S3-07. S3-09 reruns them through the page.
- A phone and desktop end-to-end check of the Keycloak sign-in, set-password, reset-password and verify-email pages on the realm theme (bead `6wz1.2`). A fix inside this ticket is limited to a realm setting or a switch to a built-in Keycloak theme. A custom Keycloak theme becomes a new bead (owner, 2026-10-22).

## Acceptance

AC-6. AC-12 and AC-14, each once light and once dark (the AC-15 part). The phone and desktop Keycloak page check.

The shared definition of done in the [index](../README.md) also applies.
