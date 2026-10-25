# Spec 3 technical plan

Confidence: 7.8/10. The spec is re-approved, and the 2026-10-22 revision settled the token set, the theme switch, the CSP scope and the deferred items. Three points lower the score. Nobody has run the shadcn command line against a Base UI registry yet. Tailwind 4 has not yet been shown to read a generated `@source` file in the Next build. A request-bound root layout makes every shell route dynamic, and no test measures that cost yet.

Status: drafted on 2026-10-22, after the owner approved the [ticket breakdown](../tickets/spec-3/README.md). It supplements [Spec 3](../specs/03-shell-branding-and-design-system.md) and does not replace its numbered requirements. The Traycer artifacts `spec-03-critique-decisions` and `section-3-ticket-plan` hold the reasoning. Revised on the same day after the cold review `spec-3-tickets-critique`: code claims corrected, D3-2 to D3-6 sharpened, D3-7 added, and S3-04 split into S3-04a and S3-04b (owner).

## Scope and decision authority

Deliver Section 3 on the Section 2 code as built. Today the code has these gaps:

- `apps/genie/src/styles/globals.css` is two lines: Tailwind and `@config`. It defines no design variables. The shared preset `packages/config/src/tailwind/preset.ts` holds a content glob only, with an empty theme. The 3yv proof `apps/genie/src/styles/tailwind-preset.test.ts` asserts that glob.
- The app sets no theme attribute: the root layout renders `<html lang>` only. `ThemeProvider` puts `data-theme` and inline colors on a `div`, and only Storybook uses it.
- Four files declare their own `focusRing`: `packages/core/src/features/admin/ui.tsx`, `audit/helpers.ts`, `break-glass/break-glass-account.tsx` and `break-glass/break-glass-sign-in.tsx`. `admin/ui.tsx` and `audit/helpers.ts` are two small kits that six screens import.
- The app scans `packages/core/src/features` (`apps/genie/tailwind.config.ts`) and `apps/genie/src` (the preset glob), and no module. Storybook adds one `@source` line per selected module through `moduleSourceLines` in `apps/storybook/.storybook/module-tailwind-sources.ts`.
- `packages/ui` has no `components.json` and no `@base-ui/react`.
- `applyBranding` does not exist. The setup seed is the only writer of `tenant_branding`. The file service applies `FILE_MAX_BYTES` (default 15 MB), the postgres adapter has no limit, and the type allow-list has no `.ico` type.
- None of the ten R-90a audit keys exist. `apps/genie/src/rpc/router.ts` lists the core router areas by hand.

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

D3-2, the app reads Tailwind sources from the selection. `apps/genie/tools/generate-registry.ts` already writes `apps/genie/src/modules.ts` from the text that `tools/generators/src/registry/emit.ts` returns. In the same run it also writes `apps/genie/src/styles/module-sources.generated.css`, with one `@source` line per selected module. The file is generated, ignored by Git, and never edited. `globals.css` imports it and adds static `@source` lines for `packages/ui/src`, `packages/core/src` and `apps/genie/src`. S3-01 removes `@config` and the preset content glob, and removes the preset if nothing else uses it. The 3yv proof is rewritten to assert the `@source` list. `moduleSourceLines` moves into `tools/generators`, and both Storybook and `generate-registry.ts` import it, so that the two hosts cannot drift. A build test asserts that a class used only in an excluded module is absent from the built CSS (R-19c, AC-3).

D3-3, the token layer is new CSS. The preset holds no token, so nothing moves. The variables, `@theme inline` and `@custom-variant dark` live in `packages/ui/src/theme/tokens.css`, exported as `@genie/ui/tokens.css` (R-1, amended 2026-10-26 by DR-13: S3-02 first wrote them in the app's `globals.css`). The app stylesheet and the Storybook preview import that file after `@import "tailwindcss"`, and keep only their own `@source` lines, so a custom app imports the same file and restates no value. `packages/ui/components.json` keeps `tailwind.css` on the app's `globals.css`, because `@shadcn/lint` reads its class grammar from that file and needs one that imports Tailwind. If the shadcn command line writes a new variable there, move it into `tokens.css`. `packages/ui/src/theme/tokens.ts` stays as the typed source for the fixed values, and a unit test compares it with the compiled CSS variables.

D3-4, the theme lives on `<html>`, and the focus ring has one owner. The root layout sets `data-theme` on `<html>`, and the pre-hydration script of R-17 sets it before paint. `ThemeProvider` stays only as a Storybook decorator that sets the same attribute on the story root. S3-02 adds one `focusRing` export to `packages/ui` and repoints the four copies to it. S3-03 deletes the two kits (`admin/ui.tsx` and the kit half of `audit/helpers.ts`), switches the six screens that import them, and adds the lint check of R-19a that refuses a second `focusRing` or `ConfirmDialog`.

D3-5, branding is emitted per request. The root layout reads branding through the tenant context reader (`DEC-34`, `DEC-46`) and renders one style element with the tenant variables. The reader throws when `tenant_branding` has no row, so the emitter uses the fixed defaults on the `SETUP_REQUIRED_HEADER` branch that the layout already has, and calls the reader otherwise (R-12a). Core builds the head output: `brandingHead(branding | undefined)` in `packages/core/src/features/shell/branding-head.tsx` returns the initial theme, the `:root` rule and the follow-device script, and `BrandingHeadElements` renders them. The layout only reads the row and renders the result, so a custom app gets the same head (DR-13, code review tokens M-1). Routes that render the shell or the sign-in page are dynamic. Do not cache their markup across requests (R-16). If a later measurement shows a real cost, a Section 5 ticket can revisit this. A change here must keep the reader as the only cache.

D3-6, one writer for shared files. S3-04a owns the only Section 3 migration (R-86a). S3-05, S3-06 and S3-07 add no migration. If one of them needs a column, it stops and the change goes into a new migration after S3-04a merges. Before the three page tickets start, S3-04a also adds the stubs they would otherwise all write: the ten R-90a audit keys in `packages/core/src/services/audit/actions.ts`, the four router keys with empty routers in `apps/genie/src/rpc/router.ts`, the four admin navigation entries, and an `issues` field on `AppError` in `packages/core/src/lib/errors/index.ts`. For the files that still change in parallel, one ticket at a time merges and the others rebase: `packages/ui` exports, `globals.css`, `packages/core/src/index.ts`, `apps/genie/src/messages/en.json` and `apps/genie/e2e/global-setup.ts`.

D3-7, the shell loads its images through the branding mark link. The identity block (S3-04b) and the Branding preview (S3-07) render their images through the branding mark link that `createBrandingMarkLink` issues in the file service, per render on the dynamic shell route. The link serves only the image that the branding row names for one slot, and it skips `can()`. It is not the record signed download link, which still runs `can()` for each file. An image shows only when its `scan_status` is clean or skipped (R-49). No new image route is added.

Amended 2026-10-23 (S3-04b): the shell's default image is the square mark. The branding mark link has a branding scope that any signed-in person may fetch, because no permission key reaches a person with no grants. `/api/files/download` is the file service's existing generic link route (Spec 1 R-38), now served by the app. It is not an image route.

## Delivery order and gates

1. Foundation. S3-01, the Base UI spike and the Tailwind sources (D3-1, D3-2).
2. Tokens. S3-02, the fixed and tenant token layers (D3-3, D3-4, D3-5).
3. Primitives and the public pages. S3-03 replaces the core kits. S3-08 builds sign-in branding, the email templates and the Keycloak page check in parallel, with branding rows written through the end-to-end seed.
4. Shell. S3-04a: the R-86a migration, the contract change, the navigation tree and the shared stubs. Then S3-04b: the chromes and shell behaviors.
5. Pages. S3-05, S3-06 and S3-07 in parallel (D3-6). AC-11b waits for S3-09, because it needs the S3-06 save path.
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
