# Design import, 2026-10-28: the batch 5 design rules

Status: imported reference snapshot for owner decisions in the batch 5 fix list. It is not production implementation or blanket design approval. The [2026-09-19 import](2026-09-19-latest.md) stays the baseline record, and the [2026-10-22 import](2026-10-22-notifications.md) stays the record for the Notifications page.

## Owner decisions

The batch 5 fix list records these decisions. The rules enter the design source first, so that the next import does not undo the build.

- Dark tables: the body rows sit on the page color and the header row is the lighter `--muted` band (L273, owner 2026-10-27).
- A dark text token for error text, `--destructive-on-dark` (`6wz1.71`).
- The drop zone rule and the breadcrumb rule.
- The sign-in redesign: one centered stack, "Sign in with SSO", and "Sign in with email and password" only when the realm allows local accounts (Specification 02 R-17c).
- Corrections of `6wz1.74`: no limited-session page, the core `PageSkeleton`, the skeleton fill rule, and no ring on a heading that receives focus after navigation.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `7c020b5` (`docs(product): record the batch 5 design rules`). The mapping is the same as in the 2026-09-19 import: `product/<path>` becomes `docs/design/<path>`. Unlike the 2026-10-22 import, HEAD reproduces this snapshot for the files below. The workspace still holds uncommitted files under `src/` and elsewhere. This import does not take them.

Before the edit, the v2 copies held nine passages that the workspace lacked. They were ported into the workspace in the same commit, so this copy loses none of them: five in `tokens.md`, one in `shell/spec.md`, and three in the sign-in spec.

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `design-system/tokens.md` | Updated | `ba04cbced0d978f67b8bb2a0bee3474b701ba5ff339275bfe9c4af7fd5e1822a` |
| `shell/spec.md` | Updated | `f6d5c4a24728561a1f9d9aac5c6807339c892ac249ca7a241ed16376f6cc2c33` |
| `sections/sign-in-and-tenant-pages/spec.md` | Updated | `62881ef6f8532360350cc1eecaf1ea2d0d40bda5043242cf677806702d02dfa3` |
| `sections/sign-in-and-tenant-pages/data.json` | Updated, one note string | `b07eb9a668506081b82eec379c5c5b8d5a4fed7fd1930656cfa191f8d4cf3ed8` |
| `sections/sign-in-and-tenant-pages/limited-session.png` | Deleted, removed in source | none |
| `sections/sign-in-and-tenant-pages/limited-session-mobile.png` | Deleted, removed in source | none |

## What changed

- `tokens.md`: the dark table band, the `--destructive-on-dark` row (red-400, 7.28:1 on gray-950 and 6.41:1 on gray-900), the field error text in dark, new Drop zone and Breadcrumbs sections, and the heading exception in Focus ring.
- `shell/spec.md`: a Breadcrumbs note that points to `tokens.md`, a Loading line that names the core `PageSkeleton`, a Route focus line, and no AppShell `loading` prop.
- Sign-in spec: the centered stack, the two entries, the shared `Alert` notice per cause, the break-glass stack, and no limited-session page. A limited break-glass session goes back to `/admin/login` (Specification 02 R-65).

## Limitations

- The sign-in captures still show the card layout from before the redesign. They change with the sign-in build.
- `reference/` still holds `LimitedSessionPage.tsx` and its route, because the workspace `src/` still has them and `src/` is not part of this import.
- No capture shows the dark table band, the drop zone or the breadcrumbs yet.
- The design workspace checks (`check:guards`, `check:manifests`) did not run, because the workspace `src/` holds uncommitted work that is not part of this import.
