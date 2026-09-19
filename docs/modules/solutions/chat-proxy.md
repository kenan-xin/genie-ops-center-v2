# Chat Proxy Contract

The chat route is a Next.js route handler that turns the external Genie chat API's server-sent events into the AI SDK UI message stream. The browser never learns the endpoint, the bot id, or the session handle.

## Request

`POST /api/m/solutions/chat` with `{ solutionId, prompt }`. Body at most 1 MB; prompt at most 8000 characters. The route takes the tenant context, the session from Better Auth, and refuses unless `can(user, 'solutions:use', solution)` holds or the user holds `solutions:admin` and the request is a preview. The solution must be type `chat`; an embedded solution returns 400. Status must be `ready`, or `draft` for an administrator preview; `maintenance` and `down` return 409 with the status.

## Upstream call

- The endpoint is `apiEndpoint` from the solution configuration. At call time, not only at save time, its origin must be in the deployment's `GENIE_CHAT_API_ALLOWED_ORIGINS` (operator-set, empty disables the route with 503) and its host must resolve to a public address; private, loopback, and link-local addresses are refused (DEC-30). The connection is opened to the address that passed the check, not resolved a second time (undici `Agent` with a `connect.lookup` that returns the validated address), so a DNS answer cannot change between the check and the connect.
- The upstream request carries only the prompt, the bot id, and the bot-side session handle. It never carries the Genie session, the user's email, or a tenant secret. If the external API later requires a key, the solution references a `tenant_integration.secret_ref`; the key is never a solution field.
- `redirect: "manual"`. A 3xx is followed only after the new target passes the same check.
- Timeouts: 10 seconds to connect, 45 seconds without bytes. The external API writes an SSE comment line `: heartbeat` every 15 seconds when no event is pending, so 45 seconds of silence means a dead socket, not a slow workflow (`OPEN-S1`). There is no total timeout in the route, because a workflow behind a solution can run for hours; the external API itself ends a request after 2 hours. The client's abort signal cancels the upstream request.
- Stream caps: 2 MB per event line. Exceeding it ends the stream with a controlled error. There is no total byte or event cap, for the same reason.
- The response must be 2xx with `text/event-stream`.

## Downstream keepalive

The route opens the upstream connection first, within the 10 second connect timeout, and checks the status and the content type. A failure there is answered with the HTTP status of the error table below, because nothing was sent to the browser yet. Only then does the route commit its own 200 response and the stream headers, and from that point, while the upstream is silent, it writes an SSE comment line (`: keepalive`) to the browser every 20 seconds. A failure after the commit (a no-data timeout, an over-long line, a malformed event, a redirect to a refused target mid-stream) cannot change the HTTP status any more, so the route ends the stream with an error part that carries the same code and copy as the table row, and the client shows it like an HTTP error. Reason: an edge in front of the deployment (a DNS provider's proxy, a cloud load balancer) closes a response that carries no bytes for about 100 seconds, and a workflow behind a solution can think for longer than that. The upstream heartbeat (`: heartbeat`, every 15 seconds) resets the route's no-data timer but is not forwarded as is, because the browser reads the AI SDK stream, so the route emits its own comment. A comment line is legal in both the SSE and the AI SDK stream framing and carries no data. The response also sets `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` so no proxy buffers the stream.

## Mapping

- The route writes the AI SDK UI message stream. It emits `start` once, then `text-start` before the first text delta and `reasoning-start` before the first reasoning delta, because the AI SDK rejects a delta whose start part was never sent.
- Each `processing` event's `answer` is a delta: emit `text-delta`. Each `reasoning` value: emit `reasoning-delta`, accumulating; if a new value is a prefix-superset of the prior, treat it as cumulative, else append.
- On `completed`: emit `text-end`, `reasoning-end` if open, and `finish`, with `outputTokens` carried as message metadata. Do not re-emit `answer` or `reasoning`; the completed event repeats both in full.
- A populated `errorMessage`, an unknown status, malformed JSON, or end of stream before `completed` fails the request with a controlled error and does not persist the handle.

## Conversation model

- One row in `chat_session_handle` per person and solution. Before the upstream call the route reads `generation` and `solution.chat_config_version`. At `completed` it stores the returned conversation id only if both are unchanged.
- New chat increments `generation` and clears the handle in one transaction; New chat is refused while a send is in flight.
- Send lease: acquire with one conditional update where no unexpired lease exists, time-to-live 30 seconds in the module constants. While the stream runs, every upstream event extends the lease, throttled to one update per 10 seconds with TanStack Pacer, so a live stream of any length keeps the lease and a crashed one frees the person within 30 seconds. Clear in `finally` only if `lease_owner` still matches.

## Error mapping

| Condition | HTTP | Client copy |
| --- | --- | --- |
| Not granted | 403 | You do not have access to this solution. |
| Solution not chat | 400 | This solution cannot be chatted with. |
| Maintenance or Down | 409 `status` | The solution's status notice. |
| Send already in flight | 409 `already-sending` | Wait for the current reply to finish. |
| Origin not approved | 400 | Contact your administrator: the endpoint is not approved. |
| Upstream non-2xx or bad content type | 502 | The solution did not respond correctly. Try again. |
| Timeout or cap exceeded | 504 | The solution took too long. Try again. |

The HTTP status applies to a failure before the route commits its response. After the commit the same condition arrives as a stream error part with the same code and the same copy ("Downstream keepalive").

## Rendering rules (client)

- `urlTransform`: links `https:` and `mailto:` only, images `https:` only. No `data:` URLs.
- Inline `style` stays stripped. Complete `<span style="color:#hex">` spans are rewritten to `data-tone` (`success`, `warn`, `error`, `neutral`) before rendering; incomplete spans are sanitized away.
- Fenced `mermaid` and `vega-lite` blocks render as diagrams and charts; everything else renders as sanitized markdown.
- A renderer test asserts: script tags stripped, unsafe link rejected, `http:` rejected, `https` and `mailto` allowed, `data:` image blocked, `https` image allowed, the known green span mapped to a tone, and a span split across deltas handled.
