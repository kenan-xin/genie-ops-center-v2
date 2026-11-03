# S7-35: Full lists from chat as an artifact or a file

Bead: `czjw.85`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-12, R-44, R-44a, R-45a, AC-8. `DEC-12`, `DEC-20`, `DEC-56`. Owner ruling 2 on `czjw.59`, 2026-11-03.
- The [Spec 7 ticket index](../README.md).
- Prototype: `ask-chat.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`279afdd`), the artifact panel.

## Dependencies

Depends on: S7-28 and S7-29 (the artifact tables and panel). Runs on an Opus model (owner rule 1).

## Scope

- A list answer shows about 5 rows and a line that says how many more. Large row counts never render in the chat.
- A table or record-list artifact stores only its query definition, so it opens at once and runs as the viewer.
- A file in Markdown, CSV, Excel or PDF comes from a core background job that runs the dataset query as the person, writes through `FileStorage`, writes an audit row and posts the download link into the chat. The agent picks the format. Core owns the file kinds, and a module adds none.
- A written document artifact is the one case that uses a background model run. Its card shows that it is being written.
- The person keeps chatting while a job runs, and the step timeline shows its state.
- Research the Excel and PDF libraries first. Each new dependency gets its `../../../core/tech-stack.md` line in the same change.

## Acceptance

With the recorded test model, "list all invoices" shows 5 rows plus "n more" and offers a table artifact and a file. The CSV and Excel files hold every row the person may see and no other. A second question answers while the file job runs. End-to-end at phone and desktop. The shared definition of done in the [index](../README.md) also applies.
