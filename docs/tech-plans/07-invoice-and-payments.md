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

## Boundaries

- Core never names a module table. Datasets compose over the select a module returns (`DEC-54`).
- Every number comes from a dataset query. The model fills a checked panel config and never writes a figure.
- The model only reads documents. Matching, links and balances are plain code.
- Core names no module function. Module tools arrive through the `agent-tools` interface (`DEC-29`, amended).
- The key lives only in the `DEC-53` core table. Model calls go through one core function.
- OpenUI: `@openuidev/react-lang` only, the `lang-core` install script denied in `allowBuilds`, `OPENUI_TELEMETRY_DISABLED=1`. Never `@openuidev/react-ui`, which pulls in Radix and zustand.

## Dependencies to add, each with a tech-stack line in its ticket

`ai` and `@openrouter/ai-sdk-provider` (S7-05), `recharts` through the shadcn Chart component (S7-04), the server PDF text library and the pdf.js viewer (S7-08, S7-09), `@openuidev/react-lang` (S7-10), `pptxgenjs` (S7-13).

## Verification

Unit tests for pure rules, integration tests on a real Postgres, stories first for UI, end-to-end tests at a phone and a desktop viewport with axe and the anti-slop scan. A recorded test model in every gate. Live models only in the evaluation script (S7-14) and the dry run (S7-15).

## Stop conditions

- Stop and ask the owner if a demo-pack total cannot be reproduced from the published datasets.
- Stop and ask before any real customer document goes to a model.
- Stop and ask if a ticket needs a module contract point that this plan does not name.
