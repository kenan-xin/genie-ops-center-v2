# The agent

This page explains how the agent works: who owns which part, and how a module adds its data and tools. Open the diagram for the picture: [agent-architecture.html](diagrams/agent-architecture.html). Its source is [agent-architecture.architecture.json](diagrams/agent-architecture.architecture.json); edit the source and regenerate the HTML with the archify skill.

## One agent, owned by core

The application has one agent (`DEC-29`). Core owns all of it: the agent route, the prompt, the chat sessions, the Ask page and the chat panel. No module has its own agent, and no module changes how the agent runs.

Core also owns four general tools (Spec 7 R-43, R-45a):

- `list-datasets` tells the model which datasets the person may read, with their fields.
- `query-dataset` runs one query on one dataset as the person.
- `open-record` finds the page of the record behind a row, so an answer can link to it.
- `make-artifact` makes a chart or a table that the person opens beside the chat, or the next version of one, from a panel config that the chart gate checks (`DEC-56`).

## How a module plugs in

A module adds to the agent only through the module contract (`module-contract.md`):

- Datasets. A module describes its data as datasets: fields, measures, a time field and a record key. Each dataset filters its own rows with `scopesFor()`, so a person sees only their rows. Core reads module data only through these datasets, never from a module table.
- Agent tools. A module that needs the agent to do something, such as making a deck, declares its own tools through the `agent-tools` capability. Slides does this. Invoices declares no tool, because the agent never writes invoices (R-46); it gives only prompt rules.
- Prompt rules. A module can add short rules to the prompt through the same capability.

Core finds these at startup in the modules that are switched on. A switched-off module's datasets and tools are not offered. Core never names a module tool. So a future healthcare, legal or CRM module joins the agent the same way, with no change to core.

## One question, step by step

1. The person asks in Ask or in the chat panel.
2. The agent route checks that the person is signed in, holds Ask, and that AI is on.
3. The route stores the question, then sends the prompt, the chat history and the tool list to the chat model (through OpenRouter, from the allowed models).
4. The model calls tools. The route runs each tool as the person and returns the result to the model. This repeats up to a step limit.
5. The answer streams back to the person while it is written, and the route stores it.

## What keeps it safe

- Every tool runs as the person who asks. `can()` decides which tools the person gets, and each dataset filters rows with `scopesFor()` (`DEC-39`).
- Tool results and document text are data, never instructions (R-46).
- A write tool runs only when the person asks for the change in their own message, and it gives an Undo.
- Each tool call writes one audit row with the tool, the dataset, the query and the row count, never the returned rows (R-47).
- Only the owner of a chat can open it (R-41).

## Built after wave 4

- Artifacts: a chart or a table of an answer gets its own versions, stored in `agent_artifact` and `agent_artifact_version` (`DEC-56`). Ask's artifact panel shows them.
- The agent panel: one full-height panel on the right of every signed-in page but Ask replaces the chat bubble and each page's own chat (Spec 7 R-42). The Agent button opens it. A page gives it a page context (names and ids only: the page, the open record, a part of it, and a list's dataset, tab, filters, search and sort), a line about the page, suggestions and a refresh through `useAgentPage` from `@genie/core/features/agent/panel`. The route checks the context with `agentPageContextSchema` and adds one prompt line (`docs/architecture/module-contract.md`).

## Planned after wave 4

These are decided but not built yet:

- A page tells the agent more of what it shows (tab, filters, search, sort, selection), by names and ids only (`czjw.77`).
- Documents and record lists as artifacts, with their makers.
- Long chats are summarized automatically, and full lists go to an artifact or a file instead of the chat.
