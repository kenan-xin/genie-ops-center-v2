# S3-02: Fixed and tenant token layers

Bead: `6wz1.4`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-01](../01-base-ui-spike-and-tailwind-sources/index.md).
Beads folded into this ticket: `u4nq`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-1 to R-18, R-12a. shadcn variable set with @theme inline in globals.css (R-1), --brand-on-dark (R-15), @custom-variant dark on <html data-theme> (R-17), type, height, radius and motion scales, focus ring on --ring (R-8, R-9), one self-hosted font face plus mono with --font-sans (R-10, R-11), per-request tenant emitter with fixed defaults before setup (R-12, R-12a, R-13, R-14, text color deferred). Fixes the drift on epic 6wz1: no variables in globals.css, ThemeProvider on a div, four focusRing copies. Folds in u4nq.

## Acceptance

AC-1, AC-2; anti-slop browser scan clean on all existing stories (closes the 12 contrast findings).

The shared definition of done in the [index](../README.md) also applies.
