# S7-49: Long background agent runs

Bead: `czjw.175`. Status and claims live in Beads, not in this document.

## Governing documents

- [`DEC-57`](../../../core/decision-log.md), long-running background agent runs (owner, 2026-11-13), items 1 to 11.
- [`DEC-58`](../../../core/decision-log.md), scaling a deployment by adding containers: the capacity that many runs at once rely on.
- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42, R-42b. `DEC-57` amends the two rules of R-42b that it changes: one handoff building per person, and Ask's history lists only Ask chats.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Data model", "Run lifecycle", "Handed-over run defaults", each amended by `DEC-57`.
- [Agent](../../../architecture/agent.md), surfaces and the handoff. [Data shape](../../../architecture/data-shape.md), `agent_session` and `tenant_settings`.
- The [Spec 7 ticket index](../README.md).
- Prototype: [`agent-runs.prototype.html`](../../../design/prototypes/agent-runs.prototype.html), variant E: Ask's history grouped by agent, and the spinner on Ask in the main menu (owner, 2026-11-13).

## Dependencies

Depends on: S7-40 (the durable run), S7-41 (the handoff and the target panel) and `xok3.83` (`DEC-58`: several app copies and the run slots per worker). The new-deck flow (`czjw.174`, its ticket file lands on its own branch) waits for this ticket: its Tasks 4 to 6 start when `czjw.175` closes.

## Scope

- Chained runs. A long run is a chain of bounded turns. Each turn is its own `core.agent-run` job with today's `AGENT_LIMITS`. When a turn reaches the step limit with tool work still pending, or the 180 second turn limit cuts it, it queues the next turn in one transaction, with a continue message that the person does not see. Each turn starts with `compactionPlan`, so compaction never happens in the middle of a tool call. The person sees one run, one status and one Stop. Stop between two turns ends the run at once, and the queued turn does nothing.
- Loop guard. A run ends when it calls the same tool with the same input 3 times in a row, also across turns. The run's answer names the tool and says that the finished work is saved. No stall guard.
- Time box. A new AI setting, `tenant_settings.agent_run_time_box_minutes` (whole minutes, default 120, from 10 to 1440), beside the models of `DEC-55`, read through the tenant context. `startRun` stores the run's end time in `agent_session.run_deadline_at`, and a continued turn keeps it, so a change applies to the next run, never to a run in progress. At the time box the run ends as Stop ends it, and its answer says that it reached the time limit.
- Run limits. A person may have up to 3 runs at once (fixed in code), and only one run may work on a record. `startRun` takes a per-person transaction-level advisory lock, then counts the person's runs, so two app copies never start a fourth run together. A unique index on (`surface`, `record_id`) where a run is active keeps one run per record. A refused start saves nothing and names its reason, with the new error codes `agent-run-limit` and `agent-record-busy`. The old partial unique index of one run per person goes. A fourth handoff from Ask is refused with the reason and writes no card. One migration also ends duplicate active runs on one record, keeping the newest.
- Ask's history is the run list. It lists every agent's chats, grouped by agent (Ask, then one group for each surface), with Recents at the bottom. Each group folds and shows its newest 3 chats with Show more. A working chat shows a spinner, a folded group keeps the spinner, and Ask in the main menu shows it on every page (a dot on the menu button on a phone). A chat whose run ended while the person was away shows a dot and a bold title until it is opened, stored in `agent_session.run_unseen`. Opening a surface chat opens its record page with the agent panel on that chat. The surface panel's own list does not change.

## Out of scope

- A cost budget per person or per deployment (`DEC-57` item 6).
- An in-app notification service (`buv3.32`).
- An administrator view of every person's runs (`buv3.33`).

## Acceptance

Integration tests on a real Postgres:

- Run limits: `a fourth run of one person is refused with agent-run-limit and saves nothing`; `two app copies starting a person's fourth run at once start only one`; `two runs on one record are refused with agent-record-busy, also from two copies at once`; `a stopped run frees its slot`; `startRun sets the run deadline from the time box setting`; `the migration keeps the newest active run on a record and ends the others`.
- Time box setting: `saving the time box changes the next run's deadline, not a running one`, and stories for the setting with a valid and an invalid value.
- Chained runs: `continueRun moves the run to a new queued job with a hidden continue message, in one transaction`; `continueRun after Stop queues nothing`; `Stop between turns ends the run at once and the queued job does nothing`; `a turn after the deadline ends the run stopped with the time limit message and calls no model`; `Try again works at once after a run stopped right after a continue message`; `a run that reaches the step cap continues in a second turn and ends with one answer`.
- Loop guard: `a run that repeats a tool call ends stopped and says why`, and unit tests of the guard.
- Run list: `history lists every surface's chats, newest first, with run status, unseen flag and the record link`; `a run that ends sets unseen, and markSeen clears it`; `markSeen on another person's chat is not-found`; `activeRuns counts only the caller's runs`.

End to end at phone and desktop: `Ask history groups chats by agent and opens a surface chat on its record page`. The S7-42 end-to-end assertion "Ask history has no Slides chat" changes with this work: Ask's history lists the Slides chat under Slides.

Close the bead only after the work is merged into local `develop`, because a watcher starts the new-deck Tasks 4 to 6 the moment it closes. The shared definition of done in the [index](../README.md) also applies.
