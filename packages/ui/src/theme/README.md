# packages/ui/src/theme

The shared theme surface.

## What belongs here

The Section 0 slice of the fixed token layer (`docs/design/design-system/tokens.md`)
and the browser-safe `ThemeProvider` that applies it. The Storybook host wires
the provider once as its decorator, so every story renders against the same
light or dark surface, and a token change invalidates the host's build.

## What must not go here

A colour computed from a tenant value, a colour-space conversion, or a product
feature. Only the fixed layer lives here: the one customizable brand colour is
the runtime Branding layer's, and the full primitive catalogue is Section 3's.

## What it imports

`react` and its own token module. Nothing internal.
