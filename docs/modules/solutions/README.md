# Module: Solutions

Kind: platform module, shipped to every tenant. Status: core roadmap Section 4.

## Who it is for

Every member of a tenant who is granted a solution, and the tenant administrator who registers solutions and decides who may use them.

## What it does

- Catalogue of solutions, grouped by core navigation category (`DEC-51`), with favorites, recents, search, sort, and a status filter.
- Two solution types. `chat`: streaming chat through a server-side proxy to the external Genie chat API, with a chat theme, welcome text, starter prompts, and optional thumbs-up and thumbs-down feedback. `embedded`: an external web application shown in a sandboxed iframe at a public HTTPS URL, with optional fullscreen; no theme.
- One viewer for both types, with a focus mode that hides the shell navigation.
- Per-solution chat styling through chat themes, separate from tenant branding.

Deliberately not built: a `native` solution type, theme presets (a new theme starts from the tenant branding colors), custom CSS in themes, and a status-page link in the Down notice. Categories are a core table and a core admin page (`DEC-51`); a deleted category leaves its solutions ungrouped.

## Permissions and roles

Permission keys: `solutions:admin`, `solutions:use`.

Default roles seeded on entitlement: `Solutions administrator` (`solutions:admin`, `solutions:use`) and `Solutions user` (`solutions:use`). Access to one solution is a `role_assignment` of a role carrying `solutions:use` with scope `solution:<id>`; tenant-wide access is the same role with a null scope. The module has no grant table of its own. The Access overview screen reads `role_assignment`.

Administrators have no implicit member access. A holder of `solutions:admin` may open any solution, including Draft, in a preview labeled as such; a preview streams for chat and renders for embedded, is not counted as access anywhere, and is written to the audit log.

## Solution configuration

`solution.config` is one jsonb column validated by a per-type schema.

Chat: `externalBotId` (string, at most 200 characters), `apiEndpoint` (the full HTTPS URL of the external chat API, at most 2000 characters, public host only), `welcomeText` (at most 2000 characters), `starterPrompts` (at most 12 entries, each at most 200 characters), `feedbackEnabled` (boolean). Changing `externalBotId` or the endpoint bumps `chat_config_version`, which invalidates every member's stored session handle.

Embedded: `iframeUrl` (a valid public HTTPS URL; private and loopback hosts refused), `allowFullscreen` (boolean). The viewer renders `<iframe sandbox="allow-scripts allow-forms">`, adds `allow="fullscreen"` when set, and the module contributes the `iframeUrl` origins of the tenant's non-archived embedded solutions to `frame-src` through the module contract's content security policy point, derived per request; there is no separate setting for it.

The module has no per-tenant configuration (DEC-30): every connection value lives on the solution, and Tenant Settings shows no Solutions section. The origins the proxy may call are an operator setting on the deployment, `GENIE_CHAT_API_ALLOWED_ORIGINS`; when it is empty, chat streaming is off and the admin screens say so.

Name is at most 80 characters, description at most 500. The slug is derived from the name at registration and never changes afterwards, so links stay valid. The monogram defaults to the name's initials and is editable.

## Chat behavior

- One conversation per person per solution. Genie Ops Center stores only a session handle, never the transcript. Reopening a solution resumes the same conversation on the bot's side; the viewer shows the welcome state with the line "Continuing your earlier conversation. Earlier messages are not shown." New chat starts a fresh conversation after a confirm step.
- One message in flight at a time, enforced by a short-lived database lease per person and solution. A second send is refused with `already-sending`.
- Replies stream as sanitized rich text. An optional reasoning block streams separately and renders as a collapsible "Thinking" disclosure that collapses to "Thought for N s" when the answer begins; an interrupted reasoning stream is labeled.
- A reply that ends without a finish signal is labeled "Incomplete response". A failed send shows a safe error with Retry; Send is disabled until Retry or New chat.
- Rendering allows `https:` and `mailto:` links and `https:` images only, strips inline styles, maps the bot's known color spans to semantic tones, and renders Mermaid diagrams and Vega-Lite charts from fenced code blocks.
- Draft, Maintenance, and Down never stream for members: the viewer shows a status notice with the administrator's reason instead of the composer. Maintenance is amber, Down is red.
- Feedback: when `feedbackEnabled` is on, each assistant reply has thumbs up and down; a vote emits `solutions:feedback` (payload: user id, solution id, message id, vote `up` or `down`, version 1) to the event bus and is written to audit, and a down-vote thanks the person in a toast. No feedback table. No subscriber exists today; the event is declared so a later module can subscribe without a change here.

The proxy contract and its limits are in `chat-proxy.md`; the observed external API contract is in `external-chat-api-contract.md`.

## Tables

`solution`: id, name, slug (unique, stable), type (`chat` or `embedded`), status (`ready`, `draft`, `maintenance`, `down`), status_reason (nullable), description, monogram, accent_color, accent_color_invert, archived, chat_theme_id (nullable, chat only), config (jsonb, see above), chat_config_version, created_at, updated_at.

`chat_theme`: id, name, config (jsonb: `headerColor`, `headerForeground`, `userBubbleColor`, `userBubbleForeground`, `assistantBubbleColor`, `assistantBubbleForeground`, `radius` 0 to 28, `font` from the approved font list, `placeholder` at most 140 characters), created_at, updated_at. Styles one chat surface.

`solution_category`: solution_id (primary key), category_id (a core `category` id, `DEC-51`; a missing category means no category). One category per solution today; widening to many-to-many changes the key only.

`favorite`: user_id, solution_id, position. Primary key on both. The pinned rail shows at most six.

`recent`: user_id, solution_id, opened_at. Primary key on both. Index on (user_id, opened_at desc). At most six are shown.

`chat_session_handle`: user_id, solution_id, external_session_uuid, generation, lease_owner, lease_expires_at, updated_at. Primary key on both. The external Genie chat API owns the conversation; only the handle is stored.

## Admin actions

Register (name, description, category, type; starts as Draft), configure per tab, set status with a reason for Maintenance and Down, archive and restore, duplicate as a new Draft, and delete permanently only when archived (cascades favorites, recents, and session handles). The admin list sorts by updated (default), name, or status, and filters by type, status, category, and archived.

## Work items

1. Module schema as above, with the two config schemas.
2. Streaming chat route per `chat-proxy.md`: server-side proxy, public-host validation at call time with redirect re-validation, timeouts and stream caps, per-user send lease, generation and config-version guards, error mapping.
3. Embedded viewer with sandbox and content security policy handling.
4. Admin screens: Solutions, Chat themes, Access overview. Categories are a core admin page (`DEC-51`).
5. Permission declaration, default roles, and admin preview.
6. Entitlement check: invisible to a tenant without `tenant_module` for it.

Done when: a member holding `solutions:use` for a chat solution opens it and streams a reply with a reasoning block, and for an embedded solution sees the external app in the frame. A member without the grant sees no navigation entry and gets a server-side refusal on the route. A `POST` to the chat route for an embedded solution returns 400.

## Decisions

These three decisions belong to this module. Their numbers stay reserved in `../../core/decision-log.md` so cross-references remain valid.

### DEC-26. Embedded solutions are kept

Question: earlier in planning the iframe-embedded solution type was marked for removal; the product owner then confirmed it is a required capability alongside chat.

Decision: the solutions module carries two types, `chat` and `embedded`. An embedded solution is an external web application at a public HTTPS URL, rendered in a sandboxed iframe (`allow-scripts allow-forms`, optional `fullscreen`), with the tenant's embedded origins listed in the content security policy `frame-src`. It has status, category, access, favorites, and recents like a chat solution, and no chat theme. The `native` type is not carried.

Designed in: Section 4. Implemented: Section 4. Revisit never; it is a product requirement.

### DEC-27. Chat conversation and status semantics

Question: the design specified that a page reload starts a fresh conversation and that Maintenance keeps the composer enabled; the proven behavior differed.

Decision: reopening a solution resumes the same bot-side conversation through the stored handle, and the viewer shows the welcome state with a line saying earlier messages are not shown; only New chat starts over. Draft, Maintenance, and Down never stream for members; the viewer shows a status notice with the administrator's reason instead of the composer. An administrator holding `solutions:admin` may preview any solution, including Draft, and the preview is labeled, audited, and not counted as access.

Designed in: Section 4. Implemented: Section 4. Revisit if transcript storage is ever added, which would allow visible history on reopen.

### DEC-30. Chat endpoint is a per-solution setting

Question: planning introduced a tenant-level approved origins list in the solutions module configuration, and each chat solution picked an origin from it. The product owner wants the endpoint entered per solution, as before, with no tenant-level list.

Decision: a chat solution carries `apiEndpoint`, the full HTTPS URL of the external chat API. The solutions module has no per-tenant configuration, and no tenant administrator maintains an origin list. The allow-list is an operator control on the deployment: `GENIE_CHAT_API_ALLOWED_ORIGINS`, a comma-separated list of HTTPS origins, read once at start; an empty value disables chat streaming for every tenant on that deployment, and the register and configure screens then show a notice that chat solutions are not enabled. On every call the proxy checks the endpoint's origin against that list, and the host must resolve to a public address; private, loopback, and link-local addresses are refused, and a redirect target passes both checks before it is followed. Changing `apiEndpoint` or `externalBotId` still bumps `chat_config_version`.

Why: the tenant administrator who registers a solution is the same person who would maintain a tenant-level list, so that list only added a second screen and a second step. Where the platform's servers may send traffic is a decision for whoever runs the deployment, so the list belongs to the operator, and one value serves the deployment because the external chat API origins are the platform's own. Host validation on every call closes the internal-address gap the list alone would leave.

Designed in: Section 4 (the disabled notice). Implemented: Section 4. Revisit never; every customer has its own deployment and therefore its own list (ADR 0007).

Defaults:

- No chat attachments; the external chat API fields for them are recorded in the contract and not exposed.
- No native solution type; the module carries `chat` and `embedded` only (DEC-26).
- No theme presets; a new chat theme starts from the tenant branding colors. The default theme is not a row: a chat solution with `chat_theme_id` null renders with the tenant branding and follows every branding change. The theme picker shows that default as a chip rendered from branding values, which cannot be edited or deleted.
- No visible chat transcript on reopen, because no messages are stored (DEC-27).

## Open decisions

| Id | Question | Default until answered |
| --- | --- | --- |
| OPEN-S1 | Answered 2026-09-17 from the external API source: it writes an SSE comment line `: heartbeat` every 15 seconds of silence and ends a request after 2 hours. The chat route's no-data timeout is 45 seconds, three missed heartbeats (`chat-proxy.md`). | Closed. |
