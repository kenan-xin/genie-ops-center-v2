# Technical plan: Section 7, invoice and payments

Specification: [07-invoice-and-payments.md](../specs/07-invoice-and-payments.md). Tickets: [spec-7](../tickets/spec-7/README.md). Drafted 2026-10-27 from the planning artifacts, after a cold critique of the plan and a cold critique of the tickets.

## Sequencing

| Wave | Work | Tickets |
| --- | --- | --- |
| 0 | Spec, roadmap order, decision closures, fixtures | S7-01 |
| 1 | Module pages and client, contract additions, chart gate, model connection | S7-02 to S7-05 |
| 2 | Three lanes: invoice module, agent runtime, dashboard and deck editors | S7-06 to S7-10, S7-12 and S7-13 start |
| 3 | Review screens, invoice answers, agent tools in the editors, evaluation | S7-09, S7-11, S7-12, S7-13, S7-14 |
| 4 | Acceptance and dry run | S7-15 |

Critical path: S7-01, S7-03, S7-06, S7-07, S7-08, S7-09, S7-15. The agent and the editors run beside it.

Follow-up of the wave 4 review (owner, 2026-11-03). The phases run one after another. P2-4 to P2-7 run on an Opus model.

| Phase | Work | Tickets |
| --- | --- | --- |
| P2-0 | Spec 7 rulings and the ticket files | none |
| P2-1 | Collapsible icon rail first, because Ask's layout depends on it, then the date picker that the list header needs | `6wz1.89`, S7-16, `xok3.49` |
| P2-2 | One list header in `packages/ui`, virtualized `DataTable`, sorting in the database with the Updated column | S7-17 to S7-22 |
| P2-3 | Document desk on the records, then the review fixes | S7-23 to S7-27 |
| P2-4 | Agent panel, Ask layout and artifact panel on one shared component set, Ask in the main menu | S7-28 to S7-30 |
| P2-5 | Page context through the module contract, the deck change tool, the deck retry fixes | S7-31 to S7-33 |
| P2-6 | Compaction with its summary line, short lists, table artifacts and file exports as a core background job | S7-34, S7-35 |
| P2-7 | Answer rules, the expected-answers file, live re-recording, demo step 9 | S7-36 to S7-39 |
| P2-8 | Dry run, signed off by the owner | none |

## Wave 5: surface agents, slide styles, speaker notes, dashboard filters (draft, 2026-11-08)

The owner settled these decisions one at a time on 2026-11-08, after the follow-up 9 dry run. They govern S7-40 to S7-47 and the spec 7 amendment of the same date (R-42b, R-46a, R-49a, R-52a, R-55a). They wait for owner approval at gate G1 of follow-up 11. The analysis sandbox (`czjw.95`) is deferred and is not part of this wave.

| Phase | Work | Tickets |
| --- | --- | --- |
| W1 | Core surface runtime, then the handoff, then the Slides and Dashboards surfaces | S7-40, S7-41, S7-42 |
| W3a | Three design prototypes: slide editor controls, presenter window, dashboard filter bar with the view menu; the owner picks a variant of each at gate G2, one stop | none |
| W3b | Position and style per element, then the "what I can change" answer | S7-43, S7-44 |
| W4 | Speaker notes and the presenter view | S7-45 |
| W5 | Dashboard filters, then saved views | S7-46, S7-47 |

### Decisions

| Topic | Decision | Rejected, and why |
| --- | --- | --- |
| Where a handed-over run executes | A job on core's pg-boss queue (`DEC-12`), with no retry. The worker runs the turn as the person; see Run lifecycle, Live progress and Stop. | A detached run in the web process: a deploy or crash ends it silently, and Stop fails across web replicas. Resumable streams: adds Redis to every stack. |
| How a module declares a surface | A new capability kind `agent-surface { name, recordPage, tools, instructions, acceptsHandoff, createRecord }`, at most one per module. Write tools move there; `agent-tools` keeps the read tools, which Ask and the module's own surface session both get. `validateRegistry` checks that `recordPage` is a declared page and that no surface tool repeats an `agent-tools` name. `slides-change-deck` and `analytics-change-dashboard` answer the new content hash, so a five-slide build fits `AGENT_LIMITS.steps` (critique 2026-11-08). | A placement flag per tool: a missed flag puts a write tool into Ask with no error. A top-level `Module` field: a second way to give the agent tools. |
| The brief | The `hand-over` tool's input is a zod schema: `surface`, `goal`, `facts[]` (text, dataset id, as-of date), `datasets[]`, `period`, `artifacts[]` (chart ids of this chat, passed as their config), `notPassed[]`. Core refuses an unknown dataset or another chat's artifact. Stored as the target session's first message: a `data-brief` part for the card and a text rendering for the model. The target queries the datasets again. | Free text: core cannot check sources. Rows in the brief: stale, large, and outside the target's own `scopesFor()` read. |
| Record creation (critique 2026-11-08) | The surface's `createRecord(ctx, { title })` is module code that creates the empty record as the person and returns its id. The `hand-over` tool calls it, binds `record_id`, creates the target session and starts the run in one transaction, then answers the address from `recordPage` and the id. A refusal saves nothing. Core never reads a module tool's output to find the record. | Parsing the create tool's output: core would guess at module output. |
| Data model | `agent_session` gains `surface` (text, not null, default `core:ask`), `record_id` (text, null), `handed_from_session_id` (uuid, null, set null on delete), `run_state` (null, `queued`, `running`, `stopping`), `run_job_id` (the pg-boss job) and `run_error` (null or a code). No `record_type`: the surface names it. A partial unique index on `user_id` where `run_state` is not null enforces one active handoff per person. | An `agent_run` table: a factory, an erasure path and a run history nobody asked for; a session never has two runs. |
| Run lifecycle (critique 2026-11-08) | `startRun` sets `queued` and sends the job (session id only, no retry) in one transaction through the existing transactional enqueue; an enqueue failure saves nothing. The worker moves `queued` to `running` and ends in null with `run_error` null, `stopped` or a failure code. At worker start and every minute, a session whose `run_job_id` is no longer active in pg-boss becomes null with `interrupted`, or `stopped` when it was `stopping`. A deleted session ends its run at the next check. | Clearing only `running` at start: a crash after Stop strands `stopping`, and a second worker could clear live work. |
| Live progress (critique 2026-11-08) | The worker upserts the answer's UI parts at most once a second while the model streams, and once at the end, so a reader sees text and the active step within about a second. | Saving only at step end: no text during a long step, and Stop loses it. |
| Stop (critique 2026-11-08) | `stopRun` sets `stopping`. The worker reads `run_state` once a second during the model call, aborts its signal, dispatches no further tool call, and saves the parts so far. | Aborting only between steps: a slow step keeps running and can still write, against `czjw.110`. |
| Test fixtures before R1 (critique 2026-11-08) | The replay transport matches the whole request, so every wave 5 change to tools or prompts breaks existing recordings. Each wave 5 ticket tests with synthetic scripted model fixtures, marked synthetic, through the same transport; R1 records them live once at the end and the same tests then pass on the recordings. | Live recording per ticket: live spend in every part. |
| How pages follow a run | TanStack Query reads the session every second while `run_state` is set; the deck or dashboard query refetches on the same tick. | Server-sent events over the database: the same reads plus a connection per page. `LISTEN`/`NOTIFY`: a dedicated connection pattern for one screen. |
| Handed-over run defaults (accepted) | The target session takes the Ask session's model and the chat turn limits (`AGENT_LIMITS`). One queued or running handoff per person. The add-as-panel question (`czjw.96`) lives in the surface's instructions and write tool. The Slides surface creates the deck with a title and no slides, then adds one slide per step. | none |
| Element position | An optional `box { x, y, w, h }` in whole units on the 960 by 540 canvas (D10), overriding the computed box of `slideLayout`. A box outside the canvas or under a minimum size per kind is refused. The editor snaps to 8 units. agent-native stores the same canvas pixels, as CSS in HTML. | Fractions: a conversion for a fixed canvas. A coarse grid: not free position. |
| Change steps | `change-element { slideId, index, box?, style? }` and `change-slide-fields { slideId, background?, notes? }`: each sets only the fields it names, `null` clears one, one step is one Undo entry. `add-slide` and `change-slide` may carry box, style and notes. The deck's `expectedHash` keeps the index valid. | Three separate steps: a resize with a font change becomes two Undo entries. Fields on `change-slide`: resends charts, so the chart gate runs and frozen figures can change with a color. |
| Style reach | Title, text and bullets: color, font size, weight, alignment, fill, border. Figure, chart, table, image: fill and border. Chart colors stay in the theme. A text color is checked against its own fill, else the slide background, else the theme background. A background change re-checks every text element without a fill. | Full style on charts: a new series-color check and a larger export mapping. |
| Style defaults (accepted) | Font sizes 12, 14, 18, 24, 32, 40, 56 canvas pixels. Border width 0, 1, 2 or 4, no radius. Minimum boxes about 80 by 32 for text and 160 by 96 for visuals, measured in the build. Phone behavior is decided at gate G2. | none |
| "What I can change" | One rule in core's base prompt for every session (R-46a). Each surface carries one written "You can change" line; a unit test reads the step kinds and style keys from the schema and fails when one is missing from the line. | A generated line: field names make a poor sentence. Slides only: Ask and Dashboards keep "no such tool". |
| Dashboard filters | The page address holds the current filters; the stored filters are the default; Save as default writes them with `set-filters` and Undo. `filters.field` becomes `filters.fields`, at most 4, and a stored single field reads as a list of one. The kind follows `DatasetFieldType`. A panel may set `ownRange`. The URL uses the list header's filter model (`czjw.73`). `panelData` and `filterValues` take optional transient filters, validated by the same schema; panel query keys include them. A field filter applies only to a panel whose dataset has the field, as today, and that panel says so; `ownRange` also drives its comparison figures (critique 2026-11-08). | Saving every click: fills the Undo history, and a shared link changes the owner's default. URL only: a dashboard opened from the list has no filters. |
| Saved views | Inside the dashboard config: `views: [{ id, name, filters }]` and `defaultViewId`, with steps `save-view` (new or update), `remove-view`, `set-default-view`, each with Undo. Save as default always stores the current filters and clears `defaultViewId`; Make default on a view sets it. The dashboard opens with the default view, else the stored filters; removing the default view clears it (critique 2026-11-08). | A `dashboard_view` table: a migration and an index, and Undo would not cover it. |

### Wave 5 boundaries

- Core names no module page: the handoff's target address comes from the surface's `recordPage`.
- Every tool call of every surface runs as the signed-in person, through `can()` and `scopesFor()`. The job carries the person's id, never a token.
- Erasing a person deletes the sessions of every surface; no new table holds personal data.
- No new dependency. The select, move and resize logic is copied from agent-native (MIT, commit `f31225ba3332a3dd4965d1ee5644df4d281bc650`, `packages/toolkit/src/canvas-interactions/canvas-interactions.ts` and `hotkey-keys.ts`) with its licence and a provenance note, in the pattern of `packages/config/oxlint/anti-slop`.
- Stop and ask the owner if a surface needs a contract point this plan does not name, or if the handed-over run cannot finish a five-slide deck inside `AGENT_LIMITS`.

## Boundaries

- Core never names a module table. Datasets compose over the select a module returns (`DEC-54`).
- Every number comes from a dataset query. The model fills a checked panel config and never writes a figure.
- The model only reads documents. Matching, links and balances are plain code.
- Core names no module function. Module tools arrive through the `agent-tools` interface (`DEC-29`, amended).
- The key lives only in the `DEC-53` core table. Model calls go through one core function.
- OpenUI: `@openuidev/react-lang` only, the `lang-core` install script denied in `allowBuilds`, `OPENUI_TELEMETRY_DISABLED=1`. Never `@openuidev/react-ui`, which pulls in Radix and zustand.
- Artifacts (R-45a, `DEC-56`, added 2026-11-03): core tables `agent_artifact` and `agent_artifact_version` beside the agent session; an artifact message part holds `{ artifactId, version }` only. A tool that makes or changes a chart, table, document or record list writes a new version in the same transaction as its message. The panel reads the chat's artifacts through the agent router as the session owner and renders each version's definition through the same OpenUI catalog, so the dataset query runs again as the viewer. The panel is a core feature in `packages/core/src/features/agent/`; on a phone it is a sheet.

## Dependencies to add, each with a tech-stack line in its ticket

`ai` and `@openrouter/ai-sdk-provider` (S7-05), `recharts` through the shadcn Chart component (S7-04), the server PDF text library and the pdf.js viewer (S7-08, S7-09), `@openuidev/react-lang` (S7-10), `pptxgenjs` (S7-13).

## Verification

Unit tests for pure rules, integration tests on a real Postgres, stories first for UI, end-to-end tests at a phone and a desktop viewport with axe and the anti-slop scan. A recorded test model in every gate. Live models only in the evaluation script (S7-14) and the dry run (S7-15).

## Stop conditions

- Stop and ask the owner if a demo-pack total cannot be reproduced from the published datasets.
- Stop and ask before any real customer document goes to a model.
- Stop and ask if a ticket needs a module contract point that this plan does not name.
