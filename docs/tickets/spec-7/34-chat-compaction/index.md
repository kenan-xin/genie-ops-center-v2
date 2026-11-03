# S7-34: Long chats compact and say so

Bead: `czjw.80`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-41 and R-47. No numbered Spec 7 line names compaction, so the acceptance comes from the bead. Owner, 2026-11-03, issue I23.
- [Data shape](../../../architecture/data-shape.md), `agent_session.summary` and `summary_through_seq`, deleted with the session, so `DEC-17` covers them.
- [How the agent works](../../../architecture/agent.md).
- The [Spec 7 ticket index](../README.md).
- Prototype: none.

## Dependencies

Depends on: S7-28 and S7-29 (the summary line shows in both frames). Runs on an Opus model (owner rule 1).

## Scope

- When the previous turn's input tokens pass a threshold of the chat model's context window, or the history passes the message limit, the route first asks the chat model for a summary of the older turns: what the person asked, what was decided, and the ids of the artifacts and records made or opened. The summary keeps no figures as facts.
- Store the summary on the session with the last sequence it covers. Later calls send the summary plus the messages after it, in place of the plain 40-message cut.
- The chat shows one quiet line, "Earlier messages were summarized", with the summary in a fold. The full messages stay stored and visible.
- The summary call writes an audit row like a tool call, with no content, and counts toward the turn's limits.
- No usage meter and no manual command (owner).

## Acceptance

With the recorded test model, a chat past the threshold sends the summary plus the recent messages, the line shows in Ask and the panel at phone and desktop, and a question about an early turn still answers. The shared definition of done in the [index](../README.md) also applies.
