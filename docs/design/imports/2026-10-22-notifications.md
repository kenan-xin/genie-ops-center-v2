# Design import, 2026-10-22: the Notifications page and the header bell

Status: imported reference snapshot for one owner decision. It is not production implementation or blanket design approval. The [2026-09-19 import](2026-09-19-latest.md) stays the baseline record for everything this import did not touch.

## Owner decision

On 2026-10-22 the owner decided that the inbox screen is the Notifications page, at `/notifications` in the workspace chrome and `/admin/notifications` in the admin chrome. The header bell with its unread count links to that page and is its only entry point. There is no navigation entry and no dropdown panel. The break-glass account uses the admin variant. The canonical record is `DEC-21` in `../../core/decision-log.md`, amended 2026-10-22. The page ships with roadmap Section 6 item 5, and the product shows no bell until then.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, with the same tree mapping as the 2026-09-19 import. The source HEAD is unchanged, and the changed source files are uncommitted or untracked, so HEAD alone does not reproduce this snapshot. The [file manifest](2026-10-22-notifications-manifest.json) records each path, its action, and the hash of the imported file.

A file was copied only when the v2 copy still matched the hash that the 2026-09-19 import wrote. A file that v2 edited after that import was not overwritten.

| Result | Count |
| --- | --- |
| Updated from source | 246, most of them regenerated captures that now show the bell |
| Added | 13: two `Notifications.tsx` files and eleven new captures |
| Deleted, removed in source | 7: the two `Inbox.tsx` files and five `inbox*.png` captures |
| Unchanged | 229 |
| Changed on both sides, merged by hand | 4: `shell/spec.md` and the `account-and-inbox` spec, types and data |
| v2-local edit kept, source unchanged | 10 |

The hand merge took the source text for the Notifications changes. It kept the v2 rule of 2026-10-19 that theme is not a personal preference, because the design source still offers a theme control in the account Preferences block. The design `CHANGELOG.md` received only its 2026-10-22 section, because the v2 copy diverged earlier.

## Verification

The design agent ran these in the authoring workspace: `pnpm run build` passed, `pnpm run check:guards` passed 20 checks, and `pnpm run check:manifests` reported 351 entries and 351 files. A Playwright check confirmed the bell's accessible names, `aria-current="page"` on the Notifications page in both chromes, no active sidebar item there, the bell links in both chromes, and no horizontal overflow at 375, 768, and 1280 pixels. These are upstream results, not reruns in this repository.

## Limitations

- The design source still shows a personal theme control in the account page captures and components. That drift predates this import and is not fixed here.
- The preview bell count is fixed at 3 and does not drop after "Mark all as read". Only the empty preview shows 0.
- The section folder stays `account-and-inbox`, because Design OS derives the folder name from the roadmap title.
- Captures are reference only, as in the 2026-09-19 limitations.
