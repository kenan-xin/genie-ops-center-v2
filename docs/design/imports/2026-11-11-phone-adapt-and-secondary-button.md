# Design import, 2026-11-11: the phone adapt and secondary button picks

Status: imported reference snapshot of the owner's picks of 2026-11-11. Follow-up 12 builds from these files: the dashboard header on a phone (`czjw.159`), the slide editor dock and the notes sheet on a phone (`czjw.156`), and the secondary button (`6wz1.99`). Desktop stays as built.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, worktree `genie-ops-center-design-prototype-phone-adapt`, branch `chore/prototype-phone-adapt`.

- `ede6299` (`docs(design): add phone adapt prototype for filters, slide editor and notes`) adds `product/phone-adapt.prototype.html`.
- `6aa4c6e` (`docs(design): add secondary button before and after prototype`) adds `product/secondary-button.prototype.html`.

The two files were copied from `6aa4c6e` with `git show 6aa4c6e:product/<file>` into `prototypes/`. The copies are identical to the source. The two commits hold no captures, so this import adds none. The data is fictional sample data.

The files are not changed. The phone adapt file opens variant A of every screen when the address has no `?variant=`, but the notes pick is C, and the secondary button file opens `before`. So the addresses below open the picks.

## Picks

| Prototype | Address of the pick | Pick | Bead |
| --- | --- | --- | --- |
| Phone adapt, dashboard filters | `phone-adapt.prototype.html?screen=filters&variant=A` | A, owner, 2026-11-11 | `czjw.159` |
| Phone adapt, slide editor | `phone-adapt.prototype.html?screen=editor&variant=A` | A, owner, 2026-11-11 | `czjw.156` |
| Phone adapt, slide notes | `phone-adapt.prototype.html?screen=notes&variant=C` | C, owner, 2026-11-11 | `czjw.156` |
| Secondary button | `secondary-button.prototype.html?variant=C` (add `&theme=dark` for dark) | C, owner, 2026-11-11 | `6wz1.99` |

The other variants stay in the files as the record of the comparison. The bead of each pick holds its scope and acceptance.

## Files

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `prototypes/phone-adapt.prototype.html` | Added | `31875ae2529e83e3d80b2252df7c386b50fefc6d7a75030d840f2ec76c39e213` |
| `prototypes/secondary-button.prototype.html` | Added | `7e71ccd220a50e7cf5b6c5d4aec4ddcd641c41b8aef2950df8f8c663360cc542` |
