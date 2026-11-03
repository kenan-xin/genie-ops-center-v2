# S7-29: Ask with the artifact panel, the rail layout and streaming answers

Bead: `czjw.78`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-41, R-42a, R-45a, AC-8. `DEC-56`. Owner, 2026-11-03 Ask review, issues I18, I18a, I18b and I18c.
- [Data shape](../../../architecture/data-shape.md), `agent_artifact` and `agent_artifact_version`.
- [How the agent works](../../../architecture/agent.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: `ask-chat.prototype.html?variant=B` in the design workspace, branch `chore/prototype-ask-chat` (`279afdd`), captures `product/ask-chat-captures/`.

## Dependencies

Depends on: `6wz1.89` (the icon rail). Builds one shared component set with S7-28 in the same branch. Runs on an Opus model (owner rule 1).

## Scope

- On Ask the main menu opens as its icon rail, and the chat history opens beside it. The history collapses on its own toggle and then hides completely. With the history collapsed, the Ask top bar shows only its toggle.
- The core tables `agent_artifact` and `agent_artifact_version`. An artifact message part holds `{ artifactId, version }` only, and a version stores the definition, never figures.
- The artifact card in the answer, and the panel: beside the chat on a desktop, a sheet on a phone, never open by itself, every artifact of the chat, a version stepper, Copy, Download and the records behind a table. A change request makes a new version.
- Answers stream word by word while the model writes. Stop keeps the partial text.
- The composer has one focus ring, and Send is disabled until it holds text.
- No module words in the Ask, panel or artifact chrome.

## Acceptance

AC-8 as amended, at phone and desktop: a change request on a chart makes version 2, the panel steps back to version 1, and a phone opens the artifact as a sheet. Stories for each state. The shared definition of done in the [index](../README.md) also applies.
