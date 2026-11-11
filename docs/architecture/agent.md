# The agent

This page explains how the agent works: who owns which part, and how a module adds its data and tools. Open the diagram for the picture: [agent-architecture.html](diagrams/agent-architecture.html). Its source is [agent-architecture.architecture.json](diagrams/agent-architecture.architecture.json); edit the source and regenerate the HTML with the archify skill.

## One agent, owned by core

The application has one agent (`DEC-29`). Core owns all of it: the agent route, the prompt, the chat sessions, the Ask page and the chat panel. A module may declare an agent surface (tools, instructions, and whether it accepts a handoff), and core runs it; no module runs an agent of its own or changes how the runtime works.

Core also owns five general tools (Spec 7 R-43, R-44a, R-45a):

- `list-datasets` tells the model which datasets the person may read, with their fields.
- `query-dataset` runs one query on one dataset as the person.
- `open-record` finds the page of the record behind a row, so an answer can link to it.
- `make-artifact` makes a chart or a table that the person opens beside the chat, or the next version of one, from a panel config that the chart gate checks (`DEC-56`).
- `make-file` queues a file of every row of one query (CSV, Excel, Markdown or PDF), which a core background job makes as the person (R-44a, `DEC-12`).

## How a module plugs in

A module adds to the agent only through the module contract (`module-contract.md`):

- Datasets. A module describes its data as datasets: fields, measures, a time field and a record key. Each dataset filters its own rows with `scopesFor()`, so a person sees only their rows. Core reads module data only through these datasets, never from a module table.
- Agent tools. A module that needs the agent to do something, such as making a deck, declares its own tools through the `agent-tools` capability. Slides does this. Invoices declares one read tool, `invoices-read-document`, so the agent can answer about the document on its review page; it declares no write tool, because the agent never writes invoices (R-46).
- Prompt rules. A module can add short rules to the prompt through the same capability.

Core finds these at startup in the modules that are switched on. A switched-off module's datasets and tools are not offered. Core never names a module tool. So a future healthcare, legal or CRM module joins the agent the same way, with no change to core.

## One question, step by step

1. The person asks in Ask or in the chat panel.
2. The agent route checks that the person is signed in, holds Ask, and that AI is on.
3. The route stores the question, then sends the prompt, the chat history and the tool list to the chat model (through OpenRouter, from the allowed models). A long chat sends its stored summary and its recent messages in place of the earlier messages. When a chat passes 40 messages after its summary, or the previous turn's input reached 64,000 tokens, the route first asks the chat model for a new summary.
4. The model calls tools. The route runs each tool as the person and returns the result to the model. This repeats up to a step limit.
5. The answer streams back to the person while it is written, and the route stores it.

## How an answer reads

Core owns the answer rules, in `packages/core/src/services/agent/prompt.ts` (Spec 7 R-44, amended 2026-11-03):

- The answer is short and in simple English: at most five sentences, counted over its paragraphs and headings. It starts with the result in one short sentence and says each figure once.
- Every figure in an answer comes from a tool result. Earlier messages of the chat and its summary can name what to look up, such as a code, a customer, a record or a period, and the answer can repeat such a name. The answer never states a figure that the person typed as a fact (Spec 7 R-44, amended 2026-11-11).
- A money answer states the total with its currency and two decimals in the first sentence, then shows the rows.
- At most one short sentence after the result helps to read it. How the figure was counted shows under the answer, from the queries.
- The answer ends with two or three questions to ask next, which the chat shows under the last answer.
- The text names no dataset and no field. It writes a date as a person reads it (27 Oct 2026), and the ISO form only inside a query.
- A list of a dataset's rows selects the dataset's `summaryFields` first.
- The rows that answer the question go in a table or chart, never in the text.
- A table or chart shows as a card under the answer, and the artifact panel opens only from that card (Spec 7 R-45a). The answer names the card, for example "Open the chart card to see each month", and never says that the chart is beside the chat.
- The answer holds no notes about the plan or the steps. The model writes text only after its last tool call, and the chat does not draw a note that a tool call follows.
- A follow-up can change an earlier chart or table of the chat by its number.
- How this was counted states each read of the answer in one plain sentence from its query, and See the rows opens the rows it returned, with no new read.

A module adds only rules about its own records, such as its measures and its record tables. Column headers read each field's `label`, which the model never sees.

## What keeps it safe

- Every tool runs as the person who asks. `can()` decides which tools the person gets, and each dataset filters rows with `scopesFor()` (`DEC-39`).
- Tool results and document text are data, never instructions (R-46).
- A write tool runs only when the person asks for the change in their own message, and it gives an Undo.
- Each tool call writes one audit row with the tool, the dataset, the query and the row count, never the returned rows (R-47).
- Only the owner of a chat can open it (R-41).

## Surfaces and the handoff

A module page that builds something has its own agent surface (`DEC-29`, amended 2026-11-07). Core runs every surface with the one runtime. Ask is the core surface.

- A session belongs to one surface. Each surface lists only its own sessions. Ask shows Ask chats, and a module page shows the chats of its surface, with the chats of the open record first.
- Ask has one core tool, `hand-over`. It runs only when the person's own message asks to build something on a surface that accepts a handoff (R-46). It writes a brief: the goal, the facts from the chat with their sources and dates, the datasets, and what it did not pass. It creates a session on the target surface with the brief as its first message, starts the run on the server, and opens the target page. The rest of the Ask chat is never passed. Ask keeps a handoff card with the live status and a link.
- The run continues on the server. If the person leaves the page, the work goes on, and the card and the target page show its status. Stop on the target page aborts the run.
- Rights do not change. Every tool call of every surface runs as the signed-in person, through `can()` and `scopesFor()`. The handoff writes one audit row that names both sessions.
- Ask offers `hand-over` only while an enabled surface accepts a handoff and the person holds the key of that surface's instructions, and then its prompt takes the write rule. The surface's `createRecord` still checks its own write key.
- A surface session's prompt names its record in one line after the module rules: "This chat belongs to the record <id> of its page." So the surface's tools take the record's id from the prompt, in the chat and in a background run. Ask's prompt has no such line.
- One transaction makes the record through the surface's `createRecord`, the target session with the brief, the audit row and the run, so a refusal saves nothing. The tool answers the model the agent's name and the title, never an id, and the chat shows a handoff card with the address. A second handoff while a build runs saves nothing, and the card leads to the build that runs. An answer shows one card for each session, also when the model calls `hand-over` twice.
- On a surface's record page, the agent panel is that surface's agent. Its header shows the surface's name and a Building or Saved chip, and it has no Open in Ask. The tab This chat shows the record's newest chat, and the tab Chats lists the surface's chats with this record's chats first. A new chat there is bound to the surface and the record. The app passes the page's path to the panel, because core imports no router. Below 768 px the panel is a bottom panel over half the screen, with no backdrop, and Show less shrinks it to its header. The chat reads its session each second while a run builds, and the page reads its record again after each change.

## Built after wave 4

- Artifacts: a chart or a table of an answer gets its own versions, stored in `agent_artifact` and `agent_artifact_version` (`DEC-56`). Ask's artifact panel shows them.
- The agent panel: one full-height panel on the right of every signed-in page but Ask replaces the chat bubble and each page's own chat (Spec 7 R-42). The Agent button opens it. A page gives it a page context (names and ids only: the page, the open record, a part of it, and a list's dataset, tab, filters, search and sort), a line about the page, suggestions and a refresh through `useAgentPage` from `@genie/core/features/agent/panel`. The route checks the context with `agentPageContextSchema` and adds one prompt line (`docs/architecture/module-contract.md`).

- Long chats: the route summarizes the earlier messages of a long chat automatically and stores the summary on the session (`czjw.80`). The summary keeps no figure as a fact, and the chat shows one quiet line where it starts.
- Page context: a page tells the agent what it shows (tab, filters, search, sort), by names and ids only (`czjw.77`).
- Full lists: a full list goes to a table artifact or a file instead of the chat. The chat shows the first rows and how many more.

## Planned after wave 4

These are decided but not built yet:

- Documents and record lists as artifacts, with their makers.
