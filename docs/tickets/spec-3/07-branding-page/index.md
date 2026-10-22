# S3-07: Branding page

Bead: `6wz1.9`. Status and claims live in Beads, not in this document.

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

Spec R-43 to R-53. R-48, R-51 and R-52 are deferred. Plan D3-7.

- The Identity, Colors and theme, and Sign-in page tabs.
- This ticket creates `applyBranding` in core. Publish goes through it, and it writes the branding row only (R-45).
- Four contrast pills with no auto-fix.
- A branding upload seam in core checks the 1 MB cap and the four-type list, then calls the file service. The service limit is `FILE_MAX_BYTES` (default 15 MB), and the postgres adapter has none.
- Add `image/x-icon` and `image/vnd.microsoft.icon` to the core allow-list in `packages/core/src/services/file-storage/index.ts`, and note it in that folder's README.
- The preview loads the logo through the signed download link (D3-7). The phone layout. R-92 to R-95 apply to every screen of this ticket (R-93 server refusal, R-94 TanStack Query, R-95 can()).

## Acceptance

AC-5, AC-13 once light and once dark (the AC-15 part), AC-17.

The shared definition of done in the [index](../README.md) also applies.
