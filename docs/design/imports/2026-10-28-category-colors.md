# Design import, 2026-10-28: the event category colors

Status: imported reference snapshot for an owner decision in the batch 5 fix list. It is not blanket design approval. The [2026-10-28 batch 5 rules import](2026-10-28-batch-5-rules.md) stays the record for the other batch 5 rules.

## Owner decision

The batch 5 fix list, row "Colorize tables and lists by event category" (owner, 2026-10-27), amends `DESIGN.md` with an exception to the State-vs-Label Rule: an event-category chip in a table or a list may carry a fixed color, as long as it is not the tenant color, a status color or the default primary blue, and the chip keeps its text label.

## Source and method

Source: `/home/kenan/work/genie-ops-center-design`, branch `chore/product-baseline`, commit `500c34f` (`docs(product): add the event category colors`). The mapping is `product/<path>` to `docs/design/<path>`.

The workspace lacked one passage that the v2 copy already held: the `EmptyState` paragraph at the end of `tokens.md` "Empty state" (v2 commit `8a27e26b`). It was ported into the workspace in the same commit, so the two copies are now identical and this import loses nothing.

| File | Action | SHA-256 of the imported file |
| --- | --- | --- |
| `design-system/tokens.md` | Updated | `809f6bb39a64274e3503e7fcec96ba643e08bf291b593d33ab9b5bb5fa236c82` |

## Where the values are read

The build reads the seven pairs from the fixed token layer (`packages/ui/src/theme/tokens.css` as `--category-<name>-bg` and `--category-<name>-fg`, and `tokens.ts` under a test). A test in `packages/ui/src/theme/tokens.test.ts` holds both rules of the table: 4.5:1 for every chip text pair in both themes, and at least 10 OKLab units from the success, warning and danger colors and the default primary blue.

## Limitations

- No capture changes. The category chips show in the audit log, whose captures are unchanged in this batch.
- The list names seven categories. A category that a later action needs takes a new fixed pair and a new row here; it does not reuse a status color.
