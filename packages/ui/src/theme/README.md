# packages/ui/src/theme

The shared theme surface.

## What belongs here

The fixed token layer of `docs/design/design-system/tokens.md`, as CSS in
`tokens.css` (exported as `@genie/ui/tokens.css`, which every app and Storybook
imports) and typed in `tokens.ts`, compared under a test (D3-3), the one focus
ring, and the Storybook-only `ThemeProvider` decorator. The decorator sets
`data-theme` on the story root, because a story has no `<html data-theme>`.

## What must not go here

A colour computed from a tenant value, a colour-space conversion, or a product
feature. Only the fixed layer lives here: the one customizable brand colour is
the runtime Branding layer's, and the full primitive catalogue is Section 3's.

## What it imports

`react` and its own token module. Nothing internal.
