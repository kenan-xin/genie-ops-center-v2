# packages/core/src/lib/branding

The one branding computation that setup and later screens share.

## What belongs here

The `foregroundFor` rule (DEC-47): the foreground colour a brand background renders with, chosen by
relative luminance. The `seed` step of `genie-ops setup` derives `tenant_branding.primary_foreground`
with it, and the Section 3 branding save reuses the same rule, so a stored foreground never drifts
between the two.

## What must not go here

A database read, a tenant context, a React component, and a second palette. This is one pure
stateless rule, ported from the branding design reference.

## What it imports

Nothing.
