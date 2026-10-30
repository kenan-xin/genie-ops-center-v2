# packages/core/src/services/agent

The boss agent's server side (Spec 7 R-40 to R-47, `DEC-29`).

## What belongs here

The owner-only store of chat sessions and their messages, the agent's tools and their access
checks, the system prompt and the route handler that the app mounts. Every read and write of
`agent_session` and `agent_message` goes through the store and filters on the signed-in person.

A tool reads only through the dataset service and the record route, as the person who asks, so
`can()` and `scopesFor()` decide what it answers. Core writes one audit row per tool call, with
the tool, the dataset, the input and the row count, never the returned values.

Ask, the bubble and the `agent` area are for a signed-in person who holds `core:ask:use` and is
not the break-glass account: that account bypasses `can()` and `scopesFor()`, and the agent must
run under both. A new deployment's `Tenant administrator` holds the key; an existing role is never
broadened, so an administrator grants it through a role. The inbox links are the enabled
`document-inbox` providers whose key the person holds.

## What must not go here

Screens: the Ask page, the chat bubble and the answer renderer live in `features/agent/`. A
module's own tools: a module provides them through its `agent-tools` capability, and core names
no module tool. A table read that skips the store, or a tool that reads a table directly instead
of going through the dataset service, `can()` and `scopesFor()`.
