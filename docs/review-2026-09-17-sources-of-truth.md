# Source-of-truth cleanup inside `docs/`, 2026-09-17

Record, not current. This cleanup was applied in September 2026. Read `README.md` in this folder for the current map of `docs/`.

Scope: this repository only. After the first design handover, `docs/design/` holds files that repeat what `core/`, `architecture/`, and `modules/` already own. `docs/` is the source of truth. This is the verdict per file, with what must be rescued before anything is deleted.

Counts: 5 files to delete, 1 to trim, 7 to move out, 1 to promote, 12 to keep.

## The rule that decides each case

`design/` holds what only the design owner can decide: the token layer, the shell, each screen's layout, states, and copy, and the sample data that renders them. What the product is, what it stores, and what a module may do lives in `core/`, `architecture/`, and `modules/`. A design file cites those. It never restates them.

Write that rule into `design/README.md`, because it is what stops this from recurring.

## Delete. The canonical file already owns the content

### `design/product-overview.md` → `core/vision.md`

The five customer problems are the same five, in the same order, as `core/vision.md` lines 33 to 37. The key-feature list is the Features section of the same file. The description paragraph is the vision's One sentence and Product shape.

Unique content: none found.

### `design/product-roadmap.md` → `core/roadmap.md` and the section specifications

Its seven "Sections" are design rounds, and each one's paragraph restates the Overview of the matching `design/sections/*/spec.md`. Its "Not in this design round" list restates the Non-goals in `core/vision.md` and the later capabilities in `core/roadmap.md` Section 5 item 8.

It also numbers its parts "Section n" while `core/roadmap.md` numbers different parts the same way, and `CLAUDE.md` sends every reader to the core one. Section 3 means People, Groups, and Roles here and Shell, branding, and design system there.

It carries three statements that a decision has replaced: the Branding tab list has no Typography (`DEC-47`), Categories is listed as a solutions admin screen (`DEC-51`), and the credential emails are said to use a theme with branding values (`DEC-40`).

Rescue first: the mapping from a design round to the core roadmap section it serves. Put it in `design/README.md` as a small table, with no "Section n" numbering of its own.

### `design/data-shape/data-shape.md` → `architecture/data-shape.md`

Same file name, same subject. The architecture file already covers every entity it names, with the columns: the deployment tables, the person statuses, erasure, the branding row, roles and assignments, and the module tables.

It also holds a defect. The `TenantBranding` entry has two stacked paragraphs that contradict each other, because an edit added the new text and left the old text under it.

Rescue first: one sentence, that a `user` is shown as "person" in every screen. Put it in `design/README.md` under the naming rule, or in `architecture/data-shape.md` beside the `user` table.

### `design/design-system/colors.json`

It declares `secondary` and `neutral`. `DEC-47` says a tenant sets one color. `design/design-system/tokens.md` opens by saying it completes this file, which is now false.

Unique content: none. Delete the file and the sentence in `tokens.md` that points at it.

### `design/design-system/typography.json`

The approved font list lives in `architecture/data-shape.md` under `tenant_branding.font_family`. The mono face is in `tokens.md`.

Unique content: none.

## Trim. Keep the file, cut the half that is not design

### `design/sections/solutions/spec.md` against `modules/solutions/README.md`

The specification restates behavior and limits the module README owns: the two types, the four statuses, and the field limits, for example the name at 80 characters and the description at 500.

Keep the layout, the states, the copy, and the empty states. Replace each restated limit with a citation of the README, so a change to a limit has one home.

The same check is worth one pass over the other six specifications. They are lower risk, because no module README competes with them.

## Move out of `docs/design/`. These are working records, not deliverables

- `review-2026-09-16.md`
- `review-2026-09-16-final.md`
- `handover-2026-09-16-gaps.md`
- `fix-report-2026-09-17.md`
- `docs-update-prompt-2026-09-17.md`
- `docs-update-prompt-2-2026-09-17.md`
- `update-dec-49-50-51-2026-09-17.md`

Each states as current a position that a later decision replaced. `handover-2026-09-16-gaps.md` uses `chat-solutions:admin` and points at `docs/modules/chat-solutions/`, which does not exist. `fix-report-2026-09-17.md` records the Dashboard landing page that `DEC-49` reversed. A reader finds no marker that any of them is history.

Put them under `design/history/` with one line at the top of each saying it is a record and not current, or drop them.

Rescue first: `update-dec-49-50-51-2026-09-17.md` ends with six questions the planning documents do not answer, for example the heading above the mixed navigation tree, and whether a switched-off module still lists its holders. Those belong in `core/vision.md` as `OPEN-n` rows, or in `DEC-50` and `DEC-51`.

## Promote

### `design/research/theming-2026-09-17.md`

This is the evidence behind `DEC-47`, and it is not a duplicate of anything. Nothing canonical cites it. The only reference is in `fix-report-2026-09-17.md`, with the stale path `product/research/theming-2026-09-17.md`, and that file is on the move-out list.

Add the citation to `DEC-47` in `core/decision-log.md`, so the research is reachable from the decision it supports.

## Keep

No canonical file competes with these.

| File | Why it stays |
| --- | --- |
| `design/design-system/tokens.md` | The fixed token layer that `core/roadmap.md` Section 3 item 1 asks the design owner to deliver. |
| `design/shell/spec.md` | The shell design behind Section 3 item 4. |
| `design/sections/*/spec.md`, seven files | The screen designs behind Section 3 item 8. |
| `design/sections/*/types.ts` | The UI contract. It pairs with `architecture/data-shape.md` and does not repeat it. |
| `design/sections/*/data.json` | Sample data that renders the screens. |
| `design/README.md` | The folder guide. Rewrite it with the rule above, the design-round table, and the naming sentence. |

One standing check to write into `design/README.md`: a field in a `types.ts` that has no column in `architecture/data-shape.md` is a finding, and the design raises it rather than inventing the column. That is how the secondary color survived for a day.

## Order

Applied on 2026-09-18: items 1 to 4 below. The six design questions went into `DEC-50` and `DEC-51`, the five files are deleted, the seven records sit in `design/history/` with a first line that marks each as a record, `design/README.md` carries the ownership rule, the design-round table, the naming sentence, and the standing check, and the captures left this folder as the handover rule says. Item 5 waits for the design owner, because the next handover would overwrite a trim made here.

1. Rescue the four items named above: the design-round table, the "person" sentence, the six open questions, and the `DEC-47` citation.
2. Delete the five files.
3. Move the seven records.
4. Rewrite `design/README.md`.
5. Trim `design/sections/solutions/spec.md`.
