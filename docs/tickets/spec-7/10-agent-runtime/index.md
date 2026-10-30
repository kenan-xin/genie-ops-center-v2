# S7-10: Agent runtime, Ask and bubble

Bead: `czjw.10`. Status and claims live in Beads, not in this document.

## Governing documents

- [Spec 7](../../../specs/07-invoice-and-payments.md), R-40 to R-43, R-45 to R-47. `DEC-29` as amended 2026-10-27.
- The [Spec 7 ticket index](../README.md) for the order and the shared definition of done.

## Dependencies

Depends on: [S7-03](../03-module-contract-additions/index.md), [S7-04](../04-chart-gate-and-component/index.md), [S7-05](../05-model-connection/index.md).

## Scope

- The agent route handler in core, mounted by the app.
- Core tables `agent_session` and `agent_message`, owner-only.
- The Ask page, the chat bubble, links to the Documents inbox, and the Ask permission seeded into the administrator role.
- The `agent-tools` interface in `packages/core/contracts`, read through the list form.
- Tools `list-datasets`, `query-dataset`, `open-record`.
- OpenUI: install `@openuidev/react-lang` only, register our components as its catalog, deny `@openuidev/lang-core` in `allowBuilds`, set `OPENUI_TELEMETRY_DISABLED=1`, never install `@openuidev/react-ui` or `@openuidev/react-headless`. Check whether `lucide-react` from `@openuidev/devtools` adds a second copy, and whether `devtools` reaches the production bundle.
- Typeset for the prose of agent answers (owner, 2026-10-27): build a `typeset-chat` preset in the shadcn Typeset builder (https://ui.shadcn.com/docs/typeset) that matches `tokens.md` (Plus Jakarta Sans, the body size and line height of the type scale). Copy `typeset.css` into `packages/ui/src/theme/typeset.css`, import it as `@genie/ui/typeset.css` after Tailwind in the app stylesheet, and wrap the text parts of each answer in `typeset typeset-chat`. Mark the OpenUI chart, table and figure components `not-typeset`, so they keep their own design. Proof: stories of an answer with headings, lists, a table and a chart, in light and dark at both viewports.
- The model picker, the system prompt rules, the tool-call audit row.
- Proven on the placeholder datasets.

Out of scope: invoice answers (S7-11), dashboard and deck tools (S7-12, S7-13).

## Acceptance

AC-8, on the placeholder datasets.
