# S3-02: Fixed and tenant token layers

Bead: `6wz1.4`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S3-01](../01-base-ui-spike-and-tailwind-sources/index.md).

Beads folded into this ticket: `u4nq`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-1 to R-18, R-12a. Plan D3-3, D3-4, D3-5.

- The token layer is new CSS. The preset holds no token to move (D3-3). Write the shadcn variable set with `@theme inline` in `globals.css` (R-1) and `--brand-on-dark` (R-15).
- `@custom-variant dark` on `<html data-theme>`, set before paint by the pre-hydration script (R-17). `ThemeProvider` stays only as the Storybook decorator (D3-4).
- Type, height, radius and motion scales. The focus ring on `--ring` (R-8, R-9). One self-hosted font face plus mono with `--font-sans` (R-10, R-11).
- The per-request tenant emitter in the root layout (R-12, R-13, R-14 with the text color deferred, R-16). It uses the fixed defaults when the `SETUP_REQUIRED_HEADER` branch of `apps/genie/src/app/layout.tsx` applies, and the branding reader otherwise, because `singletonRow` throws with no row (R-12a, D3-5).
- `packages/ui/src/theme/tokens.ts` keeps the typed fixed values, and a unit test compares them with the CSS variables.
- Add one `focusRing` export to `packages/ui` and repoint the four copies to it. Do not delete the kit files. S3-03 deletes them.

## Acceptance

AC-1, AC-2. The anti-slop browser scan is clean on every existing story, which closes the 12 contrast findings. This closes gate S3-G2.

The shared definition of done in the [index](../README.md) also applies.
