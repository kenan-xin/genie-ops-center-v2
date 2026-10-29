# Design import, 2026-10-30: the chart series colors

Status: imported reference snapshot for S7-04 (bead `czjw.4`, Spec 7 R-16). It is not blanket design approval. The design review `buv3.20` reviews the palette after Section 7.

## Why

R-16 asks for stable series colors in the one chart component. The design reference `--chart-1` to `--chart-5` failed the palette check (yellow-400 beside amber-400 at 3.4 OKLab units), had five slots for a gate that allows eight series, and changed hues between themes. The new section names eight fixed slots, checked against the light card `#ffffff` and the dark card `#111827`.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `ebcc2ed` (`docs(product): add the chart series colors`). The mapping is `product/<path>` to `docs/design/<path>`.

1. The workspace `tokens.md` got the section "Chart series colors" after "Category colors".
2. The file was copied into `docs/design/`. Before the copy, the two copies were identical.
3. `DESIGN.md` got the matching exception paragraph "Exception: chart series".

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `design-system/tokens.md` | Updated | `c7ccbe8d6f091d67363966e3010fb44953b463d4eb5380bca44ea45a960b7559` |

## Limitations

- No capture changes. The chart stories of `packages/ui` are the visual reference until `buv3.20`.
- Three light slots sit under 3:1 on white (aqua, yellow, magenta). The legend and the table view are their relief.
