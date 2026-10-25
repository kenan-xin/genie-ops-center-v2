# packages/core/src/lib/branding

The one branding computation that setup and later screens share.

## What belongs here

The `foregroundFor` rule (DEC-47): the foreground colour a brand background renders with, chosen by
relative luminance. The `seed` step of `genie-ops setup` derives `tenant_branding.primary_foreground`
with it, and the Section 3 branding save reuses the same rule, so a stored foreground never drifts
between the two.

The WCAG `contrastRatio` beside it, and the `brandingTokens` emitter: the four declarations the root
layout writes on `:root` per request (Spec 3 R-12 to R-14), with the `packages/ui` defaults when no
branding row exists.

The five contrast checks of Spec 3 R-46, built on `contrastRatio`: Fill, Text on nav, Count pill
and Focus ring for the tenant color, and Sign-in text for the sign-in background. Each check grades
its pair pass, warning or fail, and only a fail blocks Publish. The Branding page and the publish
service share them.

The field rules of the Branding page (text limits, trim, hex, UUID file ids and the R-46 floor).
The page schema and the branding seed schema both build on them, so setup never stores a value
that a later Publish refuses or changes.

The `supportContact` rule: the one support link, an email or else an http(s) page, that the mailer
footer and the no-grants home page both show, and none when branding holds no valid contact.

## What must not go here

A database read, a tenant context, a React component, and a second palette. This is one pure
stateless rule, ported from the branding design reference.

## What it imports

`@genie/ui/tokens`, for the fixed defaults, and `zod`, for the field rules. Nothing else.
