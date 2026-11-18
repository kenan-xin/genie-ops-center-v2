# Design import, 2026-11-18: the follow-up 13 G2 picks

Status: imported reference snapshot of two prototypes, with the picks of gate G2 drawn in. Follow-up 13 builds the Access pick in Phase 12 and the deck pick in Phase 14. Each file is a single, self-contained page with fictional sample data.

The coordinator made the G2 picks on 2026-11-17 on the owner's instruction ("pick one for me, record the decision"). Each pick is the recommendation of the G2 review page. The owner confirms or changes the picks at gate G3.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, worktree `genie-ops-center-design-prototype-follow-up-13`, branch `chore/prototype-follow-up-13`, head `e8fcee8`.

1. Each file was copied from `product/<file>` as it is at commit `e8fcee8`, with `git show e8fcee8:product/<file>`. That commit is the last one that touches each file. It draws two G2 changes: the Assigned via column shows only while the Person or group filter is set, and with the slide label off the company name starts the title slide subtitle.
2. One line changed in each file after the copy, so that the page opens the pick when the address has no value. `access-start.prototype.html` opens `b` instead of `a`. `deck-layouts.prototype.html` opens the slide label `off` instead of `on`. Comparison `a`, closing `a` and the brand theme were already the defaults.
3. Both files load `fonts/plus-jakarta-sans-latin-wght.woff2`, which the [follow-up 13 prototype import](2026-11-15-follow-up-13-prototypes.md) already added to `prototypes/fonts/`.
4. The design commits hold no captures. The captures below come from the imported files at 390 x 844 and 1440 x 900, opened without `v=` or `label=`, so that each one also proves the default.

## Picks

| File | Commit | Bead | Pick | Address |
| --- | --- | --- | --- | --- |
| `access-start.prototype.html` | `e8fcee8` (first drawn at `b4d0587`) | `d8l5.62` | Variant b, tabs and form. Assigned via shows only with the person filter. Access changes 1 to 4 accepted (owner, 2026-11-17, G2) | `access-start.prototype.html?v=b&view=phone\|desktop&state=<state>` (`b` is the default after this import) |
| `deck-layouts.prototype.html` | `e8fcee8` (first drawn at `c946c1c`) | `czjw.183` | Comparison a, side by side. Closing a, statement. Theme kept as drawn. Slide label dropped, so the company name starts the title subtitle. No change of the slide rules. The differences from `deck-looks` accepted, so this file governs all eight layouts (owner, 2026-11-17, G2) | `deck-layouts.prototype.html?cmp=a&close=a&label=off&theme=brand\|dark` (the defaults after this import) |

The other variants stay in the files as the record of the comparison.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/access-start.prototype.html` | Added, default changed to `b` | `e4e6868100e8feb3c6b26e85865759b602e175ed3bffd08a44950765550163ab` (at `e8fcee8`: `fb1514a5e4a47469daa70ab01ce316d21e4dc3d5c9db9dd08ec55239dda09260`) |
| `prototypes/deck-layouts.prototype.html` | Added, default label changed to `off` | `9dbe2fbe67273e2e38c904bb3429388a3484aa29e9d740e8ce4897c66d3bacc8` (at `e8fcee8`: `a2fb5c9ee64b9dfc83dbba2dc12c5254ee6425b91cce1dd0ff3d1d4680e225c6`) |
| `sections/access/access-start-<state>-<width>.png` | Added, 32 captures of variant b | Captures, not hashed |

The Access captures are `access-start-<state>-390.png` and `access-start-<state>-1440.png` for each state of variant b: `filled`, `filtered`, `add-access`, `add-person`, `added-person`, `add-group`, `added-group`, `add-module`, `added-module`, `grants`, `empty`, `loading`, `no-match`, `refused`, `no-access`, and `filled-with-notes`, which shows the switch bar and the notes.

## Limitations

- `docs/design/README.md` maps no section folder for Slides, so the deck captures are not in this repository. The capture list of follow-up 13 Phase 10 is in its run ledger, outside the repository.
- The Access spec still lists the captures of the role-per-row prototype. Follow-up 13 Phase 20 edits the Access spec lines for the accepted changes.
- In headless Chromium, word spaces render narrow with this font, as in the follow-up 13 prototype import. The captures keep this.
- The prototypes use native controls. They do not replace the shadcn and Base UI implementation.
