# packages/ui/src/theme

The shared theme surface.

## What belongs here

The typed fixed token layer of `docs/design/design-system/tokens.md`, which
`apps/genie/src/styles/globals.css` mirrors under a test (D3-3), the one focus
ring, and the Storybook-only `ThemeProvider` decorator. The decorator sets
`data-theme` on the story root, because a story has no `<html data-theme>`.

## What must not go here

A colour computed from a tenant value, a colour-space conversion, or a product
feature. Only the fixed layer lives here: the one customizable brand colour is
the runtime Branding layer's, and the full primitive catalogue is Section 3's.

## What it imports

`react` and its own token module. Nothing internal.
