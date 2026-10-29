# Design import, 2026-10-29: the fill button hover contrast

Status: imported reference snapshot for an owner-approved fix in the follow-up 6 list (bead `6wz1.87`). It is not blanket design approval.

## Owner decision

The follow-up 6 list, row "New beads" (owner, 2026-10-29), approves `6wz1.87`: the primary Button hover shade fails AA. Fix it in the token layer for light and dark, and record the new values and ratios in `tokens.md`.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `b66c49d` (`docs(product): raise the fill button hover to 94% opacity`). The mapping is `product/<path>` to `docs/design/<path>`. Before the change, the two copies of `tokens.md` were identical, so this import loses nothing.

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `design-system/tokens.md` | Updated | `95c6988ffa186a5cd427fb212d707a067b2a6cd882ad7692ea443c2476d302c3` |

## The change

A fill variant (primary and danger) drops to 94% opacity on hover, not 90%. The hover stays the same color at reduced opacity, so the no-ramp rule for the tenant color holds. Press stays at 80%.

WCAG contrast against the white button text, with the fill composited over the page:

| Fill | Page | 90% (before) | 94% (after) |
| --- | --- | --- | --- |
| primary `#2563eb` | white `#ffffff` | 4.34:1 | 4.66:1 |
| primary `#2563eb` | gray-950 `#030712` | 6.02:1 | 5.66:1 |
| danger `#dc2626` | white `#ffffff` | 4.32:1 | 4.54:1 |
| danger `#dc2626` | gray-950 `#030712` | 5.72:1 | 5.34:1 |

93% would be enough for primary (4.58:1) but not for danger (4.48:1), so one rule for both fills takes 94%.

## Where the values are read

`packages/ui/src/components/button-variants.ts` (`hover:bg-primary/94`, `hover:bg-destructive/94`) and `DESIGN.md` "Hover / Focus". The e2e case "touches the record from the browser" in `apps/genie/e2e/placeholder.spec.ts` runs axe with the primary Button hovered.

## Limitations

- No capture changes. A capture shows a button at rest.
- Press at 80% measures 3.62:1 for the default primary on white. It lasts only while the pointer is down, and this import does not change it.
- A tenant pair between 3:1 and 4.5:1 publishes with a warning, so its hover can fall further below 4.5:1. The hover rule makes the default pair pass. It does not test a tenant pair.
