# S3-01: Base UI spike and app Tailwind sources

Bead: `6wz1.3`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 3](../../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22, with its appendix "Revision of 2026-10-22".
- [Spec 3 technical plan](../../../tech-plans/03-shell-branding-and-design-system.md).
- [Design tokens](../../../design/design-system/tokens.md) and `DESIGN.md`.
- [UI development workflow](../../../architecture/ui-development.md) and [UI component sources](../../../architecture/ui-component-sources.md).
- The [Spec 3 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: none.

Beads folded into this ticket: `crg7`, `ghe`. Each is a child of this ticket's bead and closes with it.

## Scope

Spec R-19b, R-19c. Plan D3-1, D3-2.

- Set up shadcn on Base UI in `packages/ui`: `components.json`, `@base-ui/react`, one primitive in a documented story. Record the exact versions and commands in `docs/core/tech-stack.md`. If the shadcn command line cannot install Base UI components, stop and ask the owner (D3-1).
- Spec R-19b (re-approved 2026-10-22) overrides the 2026-09-21 note on bead `ghe` that said not to add an unused primitive dependency.
- `apps/genie/tools/generate-registry.ts` writes `apps/genie/src/styles/module-sources.generated.css`, one `@source` line per selected module, beside `apps/genie/src/modules.ts`. The file is ignored by Git.
- `globals.css` imports that file and adds static `@source` lines for `packages/ui/src`, `packages/core/src` and `apps/genie/src`. Remove `@config` and the preset content glob, and remove the preset if nothing else uses it.
- Move `moduleSourceLines` from `apps/storybook/.storybook/module-tailwind-sources.ts` into `tools/generators`, and import it from both Storybook and `generate-registry.ts`.
- Rewrite the 3yv proof `apps/genie/src/styles/tailwind-preset.test.ts` to assert the `@source` list.

## Acceptance

AC-3, spike part: the spike story renders, and `docs/core/tech-stack.md` records the setup. A build test proves that the built CSS holds classes from `packages/ui`, `packages/core` and each selected module, and none from an excluded module. This closes gate S3-G1.

The shared definition of done in the [index](../README.md) also applies.
