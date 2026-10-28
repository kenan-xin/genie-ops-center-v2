# Design import, 2026-10-28: the Modules phone capture

Status: imported reference snapshot. It is not blanket design approval.

## Owner decision

The batch 5 fix list, row "Modules page on phones (adapt)" (owner, 2026-10-27): the old capture was weak, so the owner approved a throwaway phone mockup as the target and asked for this capture to be replaced with one of the build. The build now follows that mockup (v2 commit `107ec0a6`): the name, the Off pill and the switch on one line, the id in muted mono, one description line, a labelled full-width category select, and a "Who can open it" row that links to Roles.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `4a5e5b7` (`docs(product): capture the Modules phone card from the build`). The mapping is `product/<path>` to `docs/design/<path>`. HEAD reproduces this file. The workspace still holds uncommitted files under `src/` and elsewhere; this import does not take them.

The capture comes from the running build (the dev app of the batch 5 worktree, `/admin/modules`, light theme), not from the workspace preview app. It keeps the old size.

| File | Size | SHA-256 of the imported file |
| --- | --- | --- |
| `sections/audit-and-tenant-settings/modules-mobile.png` | 390 x 1500, light | `4c91d0ca33db6e25b1b2583053cb1985b9aebacdf277011392bebf0167fd65cc` |

## Limitations

- The development tenant carries one module, Placeholder, so the capture shows one card. The old capture showed several sample modules. The story `Core/Modules` `Phone` shows the on, off and nothing-to-place cards.
- The cards sit in one bordered list with dividers, the shared phone card list, not apart as the mockup draws them (ledger, "Decisions to review", Phase 05 task 4).
- The development build draws the TanStack Devtools button in the lower right corner. It is not part of the product.
