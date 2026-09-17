# External Genie Chat API: Observed Contract

Captured by calling the chat endpoint `POST <origin>/public-api/v2/workflow/chatbot/chats` directly on 2026-06-30. This is a dated observation, not a verification of the production service or its authentication policy. Revalidate before relying on the error schema, multi-delta reasoning, authentication, or rate limits.

Read from the API source on 2026-09-17: every event is a `data:` line with no `event:` name, the server writes the SSE comment line `: heartbeat` after 15 seconds without an event, and the request context ends after 2 hours. The four values of the status field are `initiating`, `processing`, `completed`, and `failed`.

## Transport

- Server-sent events, `content-type: text/event-stream`, HTTP/2, `cache-control: no-cache`.
- Each event is one `data: {json}` line followed by a blank line. No `event:` types, no `[DONE]` sentinel.
- The stream ends after the event with `status: "completed"`, or after an error event.
- No authorization header was required at capture time. The proxy still keeps the endpoint server-side.

## Request

```json
{
  "uuid": "<bot id>",
  "userPrompt": "...",
  "sessionUUID": "",
  "language": "en-US",
  "documentIDs": [],
  "imageIDs": [],
  "audioIDs": [],
  "customFields": {}
}
```

| Field | Meaning |
| --- | --- |
| `uuid` | The bot or workflow id. Stable per bot. Stored as `externalBotId` in the solution configuration. |
| `sessionUUID` | The conversation id. Empty starts a new conversation; pass the returned `uuid` to continue one. |
| `userPrompt` | The person's message. |
| `language` | BCP-47, for example `en-US`. |
| `documentIDs`, `imageIDs`, `audioIDs` | Attachment ids. Empty; attachments are not in scope. |
| `customFields` | Free-form object. Empty. |

## Response event envelope

| Field | Notes |
| --- | --- |
| `uuid` | Conversation id. Same across all events of one response and on the continuation call. |
| `requestMessageID`, `responseMessageID` | Per-message ids. |
| `status` | `initiating`, then `processing` repeated, then `completed`. |
| `answer` | The streamed text. See framing below. |
| `reasoning` | Optional. The bot's thinking, streamed separately from `answer`. Absent in many responses. |
| `inputTokens`, `outputTokens`, `TokenBreakdown` | Usage, populated at `completed`. |
| `nodeInfos` | Workflow execution trace. Not used. |
| `title` | Conversation title derived from the first prompt. |
| `intents` | Intent routing object. Not used. |
| `errorMessage` | Empty on success. |
| `startTime`, `endTime` | RFC 3339. `endTime` is zero until done. |

## `answer` framing

During `processing` each event's `answer` is an incremental delta. The `completed` event's `answer` is the entire final text. Verified: deltas of 101, 73, 92, 61, 78, and 109 characters, and a `completed` answer of exactly 514 characters. The proxy streams the deltas and must not append the completed answer again.

`answer` contains inline HTML (`<strong>`, `<span style="color:#52c41a;">`, newlines), and a delta can split a tag or an attribute in the middle. The renderer must handle incomplete streaming markup and must sanitize as described in `chat-proxy.md`.

## `reasoning`

The bot's thinking, rendered as a separate collapsible block above the answer, only when present. Observed once as a single block in one `processing` event before the answer began; `completed` repeated it in full. Whether it ever streams as several deltas is unconfirmed, so the proxy accumulates and treats a prefix-superset as cumulative.

## Status lifecycle

`initiating` (empty answer) → `processing` (answer delta, repeated) → `completed` (full answer plus usage). An error event with `errorMessage` set may occur during processing; its exact shape was not captured.
