# Design import, 2026-10-30: the batch 5 spec lines in the workspace

Status: imported reference snapshot for a coordinator item of the follow-up 6 list ("Other decisions", design workspace sync). It is not blanket design approval.

## Why

Batch 5 changed three repository copies under `docs/design/` without the design workspace. A later import from the workspace would have dropped those lines. This sync ports the repository text into the workspace `product/` copy, so that the two copies are the same again.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `3d7218c` (`docs(product): port the batch 5 repository spec lines`). The mapping is `product/<path>` to `docs/design/<path>`.

1. Each repository copy below replaced its workspace copy. The repository copies were the later text in every differing line.
2. In the workspace, the two Branding lines changed from "sign-in card" to "sign-in page".
3. The four files were copied back into `docs/design/`. `git diff` under `docs/design/` then showed only the two Branding lines.

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/people-groups-and-roles/spec.md` | Unchanged in the repository, workspace updated | `6a292dc880be5279788a878995716e86d6273a03a227ece5d3519d7aea8601bc` |
| `sections/audit-and-tenant-settings/spec.md` | Unchanged in the repository, workspace updated | `5f386e553c1f4701316715561ef97ebe58df10b1dc7f76361b964a26319ee228` |
| `sections/branding/spec.md` | Updated | `0995f9d2c134d25594f4690a96ef84082b38809985a0249a14d2136af687527f` |
| `design-system/tokens.md` | Unchanged, already the same in both copies | `95c6988ffa186a5cd427fb212d707a067b2a6cd882ad7692ea443c2476d302c3` |

## The lines

- People, groups and roles: "Role detail with no assignments reads "It has no assignments."" (L303). The same file also carried older repository lines that the workspace did not have: the Add person role picks through the one role-assignment service (B1), the invitation email (R-40a), the directory group added before sign-in (`DEC-52`), and the directory group label (R-24c).
- Audit and tenant settings: the save-failure rule (one alert line in the footer, "Your change is kept.", no Retry control), "Last changed" under the card title, the help buttons, and the client-only note.
- Branding: the preview is "the sign-in page", not "the sign-in card", because the sign-in screen has no card (direction D2, owner, 2026-10-27). The build already reads "The sign-in page". The older line on the branding seed contract (`DEC-35`) is now also in the workspace.
- Tokens: the Empty state paragraph on the framed and the compact form was ported in batch 5 already. No change.

## Limitations

- Other workspace files still differ from the repository: `CHANGELOG.md`, `decisions-open-2026-09-19.md`, `sections/access/spec.md`, the `account-and-inbox` spec, data and types, and the `types.ts` of three more sections. Some of them hold workspace-only lines. This sync does not touch them, so an import of one of them needs its own comparison first.
- No capture changes.
