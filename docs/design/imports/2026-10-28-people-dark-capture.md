# Design import, 2026-10-28: the dark People table capture

Status: imported reference snapshot. It is not blanket design approval.

## Owner decision

The batch 5 fix list, item L273 (owner, 2026-10-27): in dark, the build puts the table body rows on the page color (`--background`, gray-950) and the header row on the lighter `--muted` band (gray-900). The old capture drew the body rows on the card color. The owner chose the build, and `tokens.md` "Tables and card lists" records the rule (import `2026-10-28-batch-5-rules.md`). This import replaces the capture with one of the build.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `6ec9dff` (`docs(product): capture the dark People table from the build`). The mapping is `product/<path>` to `docs/design/<path>`. The workspace still holds uncommitted files under `src/` and elsewhere. This import does not take them.

The capture comes from the running build (the dev app of the batch 5 worktree at `da90b436`, `/admin/people`, dark theme, signed in as the Tenant administrator test person), not from the workspace preview app. It is 1440 x 900, the sweep's desktop size. The old capture was 1280 x 900.

| File | Size | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/people-groups-and-roles/people-directory-dark.png` | 1440 x 900, dark | `3752647ddfad949667feb2decc130fda7f9615fe7f0f36cc9cb1673ea972915e` |

## Limitations

- The development tenant has five people, so the capture shows five rows. The old capture showed nine sample people.
- One development person signed in with a real mailbox. The capture shows that person as "Genie Studio" and `genie-studio@example.invalid`, replaced in the page before the shot. No other text changed.
- That person's groups show as cut ids, because the development database names those groups by id.
- The light and phone People captures did not change. The phase 08 sweep fixed them in the build and listed the rest.
