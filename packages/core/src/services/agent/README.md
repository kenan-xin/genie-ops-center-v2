# packages/core/src/services/agent

The boss agent's server side (Spec 7 R-40 to R-47, `DEC-29`).

## What belongs here

The owner-only store of chat sessions and their messages, the agent's tools and their access
checks, the system prompt and the route handler that the app mounts. Every read and write of
`agent_session` and `agent_message` goes through the store and filters on the signed-in person.

A tool reads only through the dataset service and the record route, as the person who asks, so
`can()` and `scopesFor()` decide what it answers. Core writes one audit row per tool call, with
the tool, the dataset, the input and the row count, never the returned values.

A module tool that names a `permission` is offered only to a person who holds that key. The
system prompt is core's rules, then the `instructions` lines of each enabled `agent-tools`
provider whose key the person holds, then the line that names the open record when the request
carries a context, then a blank line and the answer catalog. Core's no-write rule becomes the write
rule only for a person offered a tool with `writes: true`, so every other prompt stays the same.

`make-artifact` checks a panel config through the chart gate as the person and records a pending
version of a chat artifact (`DEC-56`). The model names an artifact by its number in the chat and
reads back no id, so a recorded request stays the same on every run. The tool writes a
`data-artifact` part `{ artifactId, version }` into the answer's stream, and the route writes the
answer with its pending versions in one transaction when the stream ends, also after Stop. The
model never reads a `data-*` part.

The `chart` procedure draws an answer's chart through the chart gate as the viewer. A table whose
query selects its dataset's record key field opens each row's record through the record route,
and the key column is not drawn.

Ask, the bubble and the `agent` area are for a signed-in person who holds `core:ask:use` and is
not the break-glass account: that account bypasses `can()` and `scopesFor()`, and the agent must
run under both. A new deployment's `Tenant administrator` holds the key; an existing role is never
broadened, so an administrator grants it through a role. The inbox links are the enabled
`document-inbox` providers whose key the person holds. `chatAvailability` maps that access to the
`on`, `off` or `none` that a module page loader answers for the chat beside it, so no module
copies the mapping.

The route checks a request in this order and throws the catalogue error before the stream starts
and before any write: not signed in (`unauthenticated`); no `core:ask:use` or the break-glass
account (`forbidden`); AI not on (`ai-off`); a body over 64 KB (`request-too-large`); a body that
is not one text part of 1 to 4,000 characters, or whose optional record context is not a kebab-case
type of at most 64 characters and an id of 1 to 64 letters, digits or hyphens (`invalid-input`); another person's session id
(`not-found`); a model the settings do not allow, the picked one for a new session or the stored
one for an existing session (`model-not-allowed`). Only then does it create the session, store
the message and stream the answer, which it stores when the stream ends.

A long chat summarizes its earlier messages (S7-34, `compaction.ts`). A turn summarizes when more
than 40 messages follow the stored summary, or when the largest step input of the previous turn
reached 64,000 tokens. The message trigger keeps the last 10 messages from a user message on, and
the token trigger keeps only the new question. The summary call reads a plain transcript with no
read result, takes one of the turn's steps and its abort signal, and writes one `summarize-chat`
audit row with no text. The session stores the summary and the last `seq` it covers, and later
calls send the summary as a user message after the system text, then the messages after it. If
the summary call fails, the turn answers from the stored summary and the last 40 messages after
it (`trimHistory`), and the next turn tries again. The session still stores and shows every
message.

## What must not go here

Screens: the Ask page, the chat bubble and the answer renderer live in `features/agent/`. A
module's own tools: a module provides them through its `agent-tools` capability, and core names
no module tool. A table read that skips the store, or a tool that reads a table directly instead
of going through the dataset service, `can()` and `scopesFor()`.
