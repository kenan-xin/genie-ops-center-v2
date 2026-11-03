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
