# Design import, 2026-11-15: the follow-up 13 prototypes

Status: imported reference snapshot of seven prototypes that the owner approved during the follow-up 11 dry run. The later phases of follow-up 13 build from these files. Each file is a single, self-contained page with fictional sample data.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, worktree `genie-ops-center-design-prototype-phone-adapt`, branch `chore/prototype-phone-adapt`, head `0b6bd37`.

1. Each file was copied from `product/<file>` as it is at its named commit, with `git show <commit>:product/<file>`. For each file, the named commit is also the last commit that touches the file on the branch.
2. One line changed after the copy: `review-desk-compare.prototype.html` now opens `form` instead of `polished` when the address has no `?v=`. `deck-looks.prototype.html` already opens `split`, so it is unchanged.
3. `deck-looks.prototype.html` and `review-desk-compare.prototype.html` load `fonts/plus-jakarta-sans-latin-wght.woff2`. The font came from commit `d34dfd9` into `prototypes/fonts/`. It is byte-identical to `packages/ui/src/fonts/plus-jakarta-sans-latin-wght-normal.woff2`.
4. The named commits hold no captures. Phase 01 of follow-up 13 captures the picked states in its run folder.

## Picks

| File | Commit | Bead | Pick | Address |
| --- | --- | --- | --- | --- |
| `deck-phone.prototype.html` | `023181a` | `czjw.176` | The phone deck page (owner, 2026-11-14) | `deck-phone.prototype.html?state=<state>` |
| `role-detail.prototype.html` | `b2da8f0` | `d8l5.61` | Role detail with the standard access words (owner, 2026-11-14) | `role-detail.prototype.html?view=phone\|desktop&holders=<state>` |
| `person-access.prototype.html` | `3c430a9` | `d8l5.61` | The standard assignments table (owner, 2026-11-14) | `person-access.prototype.html?view=phone\|desktop&viewer=<role>&access=<state>` |
| `edit-slide.prototype.html` | `48ba3bd` | `czjw.180` | One stacked form (owner, 2026-11-15) | `edit-slide.prototype.html?view=desktop\|phone&state=chart\|image\|full\|bullets\|nobody` |
| `agent-progress.prototype.html` | `b503b2b` | `czjw.181` | One live last row, aligned icons, one-size answer (owner, 2026-11-14) | `agent-progress.prototype.html?moment=<n>` |
| `deck-looks.prototype.html` | `d34dfd9` | `czjw.183` | Look 1, Split panel (owner, 2026-11-15) | `deck-looks.prototype.html?look=split` (the default) |
| `review-desk-compare.prototype.html` | `0b6bd37` | `czjw.187` | One form (owner question 6, 2026-11-15) | `review-desk-compare.prototype.html?v=form` (the default after this import) |

The other looks of `deck-looks.prototype.html` and the `polished` variant of `review-desk-compare.prototype.html` stay in the files as the record of the comparison.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/deck-phone.prototype.html` | Added | `14f974ec9624a5e683a17fa12bbdd5879e7cf531404e5c15895bf9080e50ead1` |
| `prototypes/role-detail.prototype.html` | Added | `62a6a50949a4359757577c26232e5d147bc226458d8c4a9b0008e4b79e930feb` |
| `prototypes/person-access.prototype.html` | Added | `d3ec0f8a556243b6828f3d3c51a559643ab23f8cf6899c92fc418a337f91f37f` |
| `prototypes/edit-slide.prototype.html` | Added | `292854f2f4698509cda17e07203804568fcc72e87be85372b4d5d1ee4484f1cd` |
| `prototypes/agent-progress.prototype.html` | Added | `2e3d55682edd58523476a61475dd3e64efa03b17b929dede0f632cabe9652cd9` |
| `prototypes/deck-looks.prototype.html` | Added | `8bda4213330a9abb56f29bce489420dc09b1ea013c8a9be983b07a150480506f` |
| `prototypes/review-desk-compare.prototype.html` | Added, default changed to `form` | `39e67c56348e604bf1a30ba08c6758d4ac29f63374746d96a1c120760f83c2ce` (at `0b6bd37`: `31e7a34d31aa345543e7da0d7327c5c85968a978c0442d6f9ff56eeca8cae760`) |
| `prototypes/fonts/plus-jakarta-sans-latin-wght.woff2` | Added | `153fc85b70298beeb1d61a5f723331649e7f23bb77302a66e61cb3e2fbdb5e79` |

## Limitations

- The prototypes use native controls. They do not replace the shadcn and Base UI implementation.
- The import holds no captures. The capture list of follow-up 13 Phase 01 is in its run ledger, outside the repository.
