# Spec 3 technical plan

Confidence: 7.8/10. The spec is re-approved, and the 2026-10-22 revision settled the token set, the theme switch, the CSP scope and the deferred items. Three points lower the score. Nobody has run the shadcn command line against a Base UI registry yet. Tailwind 4 in the app still reads a JavaScript config through `@config`. A request-bound root layout makes every shell route dynamic, and no test measures that cost yet.

Status: drafted on 2026-10-22, after the owner approved the [ticket breakdown](../tickets/spec-3/README.md). It supplements [Spec 3](../specs/03-shell-branding-and-design-system.md) and does not replace its numbered requirements. The Traycer artifacts `spec-03-critique-decisions` and `section-3-ticket-plan` hold the reasoning.

## Scope and decision authority

Deliver Section 3 on the Section 2 code as built. Today the code has these gaps:

- `apps/genie/src/styles/globals.css` imports Tailwind and the shared preset through `@config`, and defines no design variables.
- `ThemeProvider` in `packages/ui/src/theme/theme-provider.tsx` puts `data-theme` and inline colors on a `div`, not on `<html>`.
- Four files declare their own `focusRing`: `packages/core/src/features/admin/ui.tsx`, `audit/helpers.ts`, `break-glass/break-glass-account.tsx` and `break-glass/break-glass-sign-in.tsx`.
- `apps/genie/tailwind.config.ts` scans only `packages/core/src/features`. Storybook adds one `@source` line per selected module through `apps/storybook/.storybook/module-tailwind-sources.ts`.
- `packages/ui` has no `components.json` and no `@base-ui/react`.

| Accepted direction | Authority |
| --- | --- |
| shadcn on Base UI, not Radix | `docs/core/tech-stack.md`, R-19b |
| shadcn variable set with `@theme inline`, `--brand-on-dark` | R-1, R-15, revision F-1 to F-6 |
| `@custom-variant dark` on `<html data-theme>` | R-17 |
| Branding style element and theme script under the minimal CSP, no nonce | R-16, R-42, AC-4a, `DEC-31` |
| One font face plus mono | R-10, R-11, revision F-24 |
| Text-only sign-in and email branding | R-54, R-59, revision F-1 |
| Ticket order and folded beads | owner, 2026-10-22, [ticket index](../tickets/spec-3/README.md) |

## Decisions

D3-1, the Base UI spike decides the primitive setup. S3-01 runs the shadcn command line with a Base UI registry in `packages/ui`, writes `components.json`, adds `@base-ui/react`, and renders one primitive in a documented story. It records the exact versions and commands in `docs/core/tech-stack.md`. If the command line cannot install Base UI components, S3-01 stays open and every primitives ticket waits for the owner (owner answer, 2026-10-22). Do not hand-write the components, and do not fall back to Radix, without that answer.

D3-2, the app reads module Tailwind sources from the selection. The registry emitter in `tools/generators/src/registry/emit.ts` already writes `apps/genie/src/modules.ts` from `MODULE_INCLUDE`. It also writes `apps/genie/src/styles/module-sources.generated.css`, with one `@source` line per selected module, in the same run. The file is generated, ignored by Git, and never edited. `globals.css` imports it and adds static `@source` lines for `packages/ui/src` and `packages/core/src`. The Storybook plugin and the emitter share one helper for the line format, so that the two hosts cannot drift. A build test asserts that a class used only in an excluded module is absent from the built CSS (R-19c, AC-3).

D3-3, the token layer is CSS-first. S3-02 moves the colors, scales and radius from the JavaScript preset into `@theme inline` in `globals.css`. The preset keeps only what Tailwind 4 still reads from a config. The 3yv proof, which asserts that the app reads the preset, changes in the same ticket to assert the new source of truth. It is not deleted without a replacement. `packages/ui/src/theme/tokens.ts` stays as the typed source for the fixed values, and a unit test compares it with the CSS variables.

D3-4, the theme lives on `<html>`. The root layout sets `data-theme` on `<html>`, and the pre-hydration script of R-17 sets it before paint. `ThemeProvider` stays only as a Storybook decorator that sets the same attribute on the story root. The focus ring is one export from `packages/ui`, and the four copies are deleted in S3-02. S3-03 adds the lint check of R-19a that refuses a second `focusRing` or `ConfirmDialog`.

D3-5, branding is emitted per request. The root layout reads branding through the tenant context reader (`DEC-34`, `DEC-46`) and renders one style element with the tenant variables, or the fixed defaults before setup (R-12a). Routes that render the shell or the sign-in page are dynamic. Do not cache their markup across requests (R-16). If a later measurement shows a real cost, a Section 5 ticket can revisit this. A change here must keep the reader as the only cache.

D3-6, one writer for shared files. S3-04 owns the only Section 3 migration (R-86a). S3-05, S3-06 and S3-07 add no migration. If one of them needs a column, it stops and the change goes into a new migration after S3-04 merges. The same rule covers `packages/ui` exports and `globals.css` while those three tickets run in parallel: one ticket at a time merges a change to them, and the others rebase.

## Delivery order and gates

1. Foundation. S3-01, the Base UI spike and the Tailwind sources (D3-1, D3-2).
2. Tokens. S3-02, the fixed and tenant token layers (D3-3, D3-4, D3-5).
3. Primitives and the public pages. S3-03 replaces the core kit. S3-08 builds sign-in branding, the email templates and the Keycloak page check in parallel.
4. Shell. S3-04, with the R-86a migration.
5. Pages. S3-05, S3-06 and S3-07 in parallel (D3-6).
6. Acceptance. S3-09.

Gate S3-G1 comes after step 1. The spike story renders, `docs/core/tech-stack.md` records the setup, and the built CSS proves R-19c. No other primitives ticket starts before this gate.

Gate S3-G2 comes after step 2. AC-1 and AC-2 pass. The anti-slop browser scan (`npx impeccable detect`) is clean on every existing story, which closes the 12 contrast findings of bd memory `anti-slop-2026-10-21`.

Gate S3-G3 comes at the end. Every Spec 3 acceptance criterion passes at phone and desktop viewports (`DEC-25`), axe passes on every Section 3 screen, and the final anti-slop scan is clean on every Section 3 story.

## Stop conditions

Stop and seek a revised decision in these cases:

- The shadcn command line cannot install Base UI components (D3-1).
- Tailwind 4 cannot read an imported `@source` file in the Next build (D3-2).
- The branding style element or the theme script does not apply under the minimal CSP without a nonce (AC-4a).
- A page ticket needs a new column or table (D3-6).
- A design capture asks for a value that is not in `docs/design/design-system/tokens.md`.

Record the failed command, the versions and the smallest alternatives. Do not weaken `DEC-25`, `DEC-31`, `DEC-34` or `DEC-46` to pass a gate.

## Assumptions

- The shadcn 4.x command line supports a Base UI registry. Not verified. S3-01 proves or refutes it.
- Tailwind 4 resolves an `@import` of a generated CSS file that holds only `@source` lines. Not verified for the Next build. S3-01 proves it.
- A dynamic root layout is acceptable for the MVP. No measurement exists.

## Unresolved

- None that blocks the tickets.
