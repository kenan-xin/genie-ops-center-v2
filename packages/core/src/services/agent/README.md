# packages/core/src/services/agent

The boss agent's server side (Spec 7 R-40 to R-47, `DEC-29`).

## What belongs here

The owner-only store of chat sessions and their messages, the agent's tools and their access
checks, the system prompt and the route handler that the app mounts. Every read and write of
`agent_session` and `agent_message` goes through the store and filters on the signed-in person.

A tool reads only through the dataset service and the record route, as the person who asks, so
`can()` and `scopesFor()` decide what it answers. Core writes one audit row per tool call, with
the tool, the dataset, the input and the row count, never the returned values.

The system prompt is core's rules, then the `instructions` lines of each enabled `agent-tools`
provider whose key the person holds, then a blank line and the answer catalog.

The `chart` procedure draws an answer's chart through the chart gate as the viewer. A table whose
query selects its dataset's record key field opens each row's record through the record route,
and the key column is not drawn.

Ask, the bubble and the `agent` area are for a signed-in person who holds `core:ask:use` and is
not the break-glass account: that account bypasses `can()` and `scopesFor()`, and the agent must
run under both. A new deployment's `Tenant administrator` holds the key; an existing role is never
broadened, so an administrator grants it through a role. The inbox links are the enabled
`document-inbox` providers whose key the person holds.

The route checks a request in this order and throws the catalogue error before the stream starts
and before any write: not signed in (`unauthenticated`); no `core:ask:use` or the break-glass
account (`forbidden`); AI not on (`ai-off`); a body over 64 KB (`request-too-large`); a body that
is not one text part of 1 to 4,000 characters (`invalid-input`); another person's session id
(`not-found`); a model the settings do not allow, the picked one for a new session or the stored
one for an existing session (`model-not-allowed`). Only then does it create the session, store
the message and stream the answer, which it stores when the stream ends.

## What must not go here

Screens: the Ask page, the chat bubble and the answer renderer live in `features/agent/`. A
module's own tools: a module provides them through its `agent-tools` capability, and core names
no module tool. A table read that skips the store, or a tool that reads a table directly instead
of going through the dataset service, `can()` and `scopesFor()`.
