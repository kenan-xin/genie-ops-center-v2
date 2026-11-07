# S7-40: Core surface runtime: contract, sessions and the durable run

Bead: `czjw.113`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-42b, R-43, AC-13.
- [Technical plan](../../../tech-plans/07-invoice-and-payments.md), wave 5, Decisions: "Where a handed-over run executes", "How a module declares a surface", "Data model", "Run lifecycle", "Live progress", "Stop", "Test fixtures before R1".
- The `DEC-29` amendment of 2026-11-07, applied to `docs/core/decision-log.md` and `docs/architecture/agent.md` by `cvij.6` (phase D0).
- [Module contract](../../../architecture/module-contract.md), capabilities. [Data shape](../../../architecture/data-shape.md), `agent_session`.
- The [Spec 7 ticket index](../README.md).
- Prototype: none; this ticket has no screen.

## Dependencies

Depends on: `cvij.6` (the decision documents) and `czjw.110` (Stop aborts the model call). No module declares a surface and nothing starts a job run in production code, so Ask works as before when it merges.

## Scope

- Contract: the `agent-surface` capability (`name`, `recordPage`, `tools`, `instructions`, `acceptsHandoff`, `createRecord`), at most one per module. A surface session gets the surface's tools plus its own module's `agent-tools`, so its read tools are not declared twice. `validateRegistry` refuses a `recordPage` that is not a declared page of the module and a surface tool whose name repeats one of the module's `agent-tools`. `createRecord(ctx, { title })` is module code that creates an empty record as the person and returns its id. Update `module-contract.md`.
- Data: one migration of `agent_session` with `surface`, `record_id`, `handed_from_session_id`, `run_state`, `run_job_id` and `run_error`, and a partial unique index on `user_id` where `run_state` is not null. Factories. Erasure still deletes every session; a run whose session is gone ends at its next check. Update `data-shape.md`.
- Tool filter: an Ask session has every module's `agent-tools` and core's tools; a surface session has its surface tools, its module's `agent-tools`, `list-datasets`, `query-dataset`, `open-record` and the artifact tool.
- Durable run, as a core service any later ticket calls: `startRun(sessionId)` sets `run_state = queued` and sends a pg-boss job (payload: session id only, no retry) in one transaction, through the existing transactional enqueue. The worker builds the person's principal as job starters do today, sets `running` only from `queued`, runs the turn with the session's model and `AGENT_LIMITS`, and ends in null with `run_error` null, `stopped` or a failure code.
- Live progress: the worker writes the answer's UI parts at most once a second while the model streams and once at the end, upserting one message by id, so a reader sees text within about a second.
- Stop: `stopRun(sessionId)` sets `stopping`. The worker reads `run_state` once a second during the model call, aborts its signal, dispatches no further tool call, and saves the parts so far.
- Recovery: at worker start and every minute, a session whose `run_state` is set but whose `run_job_id` is no longer active in pg-boss becomes null with `run_error = interrupted` (or `stopped` when it was `stopping`).
- Fixtures: a test-only surface in the placeholder module and synthetic scripted model fixtures (marked synthetic, not recorded) for the run tests.

Out of scope: the `hand-over` tool and every screen (S7-41), the Slides and Dashboards surfaces (S7-42).

## Acceptance

Unit tests: the per-session tool filter and the registry checks. Integration tests with the test surface: a run finishes after its starter disconnects; a reader sees a partial answer before the run ends; Stop during a slow model call ends the run within about a second and no later tool call runs; a second run for the same person is refused by the index; a worker restart turns a running or stopping session into interrupted or stopped; an enqueue failure leaves `run_state` null; deleting the session ends the run. The shared definition of done in the [index](../README.md) also applies.
