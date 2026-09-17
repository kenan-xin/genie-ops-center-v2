Record, not current. This file is history of one design round. It states positions that later decisions replaced. Read `../../core/decision-log.md` for what stands.

# Handover to the design agent: gap fixes, 2026-09-16

Status, 2026-09-17: applied in full. Superseded by `review-2026-09-16-final.md`; do not work from this file.

This supersedes nothing; `review-2026-09-16.md` still applies in full (mobile first, screenshots, and the section fixes listed there). This file adds what a comparison with the earlier product surfaced, and it records the platform decisions that changed. The specs, `types.ts`, and `data.json` files have already been updated to match; your job is the components, the screenshots, and the places marked "design decision needed" below.

Read first: `product/design-system/tokens.md` (new, the values every spec now points at), `product/shell/spec.md` (new "Cross-cutting behaviors" section), `product/sections/chat-solutions/spec.md` (rewritten), and the platform documents in `../genie-ops-center-v2/docs/modules/chat-solutions/` (`README.md`, `chat-proxy.md`, `external-chat-api-contract.md`).

## 0. Build is red. Fix first.

`npx tsc -b` reports 10 errors because types moved ahead of components:

- `src/sections/branding/components/previews.tsx:19`, `ui.tsx:30`, and the branding data: `ScanStatus` is now `pending | clean | infected | skipped`; replace every `scanning` with `pending` (UI label stays "Scanning").
- `src/sections/chat-solutions/SolutionsHub.tsx:9`, `components/SolutionsHub.tsx:24,49,62`, `components/SolutionViewer.tsx:114`: `Viewer.isAdmin` is gone; use `viewer.permissions.includes('chat-solutions:admin')`.
- `src/sections/chat-solutions/components/ChatThemes.tsx:26`: `ChatThemeInput` requires `headerForeground`.

## 1. Decisions that changed (read before designing)

- Embedded solutions are back (`DEC-26`). Two types, `chat` and `embedded`. An embedded solution is an external web app in a sandboxed iframe at a public HTTPS URL, with optional fullscreen, status, category, access, favorites, and recents, and no chat theme.
- Reopening a chat solution resumes the same bot-side conversation; the viewer shows the welcome state plus "Continuing your earlier conversation. Earlier messages are not shown." Only New chat starts over (`DEC-27`). Remove any "fresh conversation on reload" behavior.
- Draft, Maintenance, and Down never stream for members. The viewer shows a status notice instead of the composer or frame. Maintenance amber, Down red (`DEC-27`).
- Administrators have no implicit member access. A holder of `chat-solutions:admin` gets Preview as member on any solution, including Draft; the preview is labeled and never counted as access.
- Focus mode replaces the old sidebar-only, standalone, and presenter modes: one toggle that hides the shell navigation, with Exit focus in the viewer header; always on for phones.
- Files upload through Genie with a progress bar (no signed URLs, no object storage copy).
- Break-glass password rule: 14 characters, three of four classes, not the email, not the provisioning password; forced change plus authenticator enrollment on first sign-in with a limited session until both are done.
- The tenant-level approved origins list is gone (`DEC-30`); the allowed origins are an operator setting of the deployment, invisible to tenant administrators. The Connection tab needs one more state: chat streaming disabled on this deployment (notice copy in the spec). `Solution.apiEndpoint` replaces `endpointOrigin` and `endpointPath`; `approvedOrigins` is removed from `ChatSolutionsProps` and `data.json`. Item E3 in `review-2026-09-16.md` is withdrawn. Components that read the old fields must be updated: `src/sections/chat-solutions/AdminSolutions.tsx` (prop and the register default), `components/AdminSolutions.tsx` (prop), `components/ConfigureSolutionSlideOver.tsx` (origin select, path input, and the Tenant Settings link become one `apiEndpoint` mono field with public HTTPS validation).

## 2. Chat solutions (spec rewritten)

2.1 Register dialog: add the Type radio (Chat, Embedded) with one line each; name at most 80 characters, description at most 500; note that the slug is derived once.

2.2 Configure slide-over: tabs depend on type. Chat: General, Chat (adds the Feedback switch; starter prompts editor enforces at most 12 items of 200 characters), Connection (external bot id and API endpoint as mono text fields, endpoint validated as public HTTPS; no origin select and no link to Tenant Settings, see `DEC-30`), Status, Access. Embedded: General, Connection (iframe URL validated as public HTTPS, Allow fullscreen switch), Status, Access.

2.3 Admin Solutions table: add Type column and type filter, sort control (updated default, name, status), row overflow with Duplicate as draft, Archive or Restore, Delete (archived only, confirm names favorites, recents, session handles removed). Card list on phones.

2.4 Hub: type label pill on cards, sort select (recently opened, name), Recents capped at six, filter empty state with Clear filters. Screenshot with all Ready to prove the status filter hides.

2.5 Viewer header: back link to Solutions, type label, Focus toggle (hidden on phones, Exit focus when on), New chat for chat or Fullscreen for embedded when allowed. Screenshot both types.

2.6 Chat body: reasoning disclosure ("Thinking" streaming, collapses to "Thought for N s", reopenable, "Reasoning interrupted" state); "Incomplete response" label; failed send with safe error, Retry, and disabled Send; thumbs up and down on assistant replies when `feedbackEnabled`, down-vote toast; the continuing-conversation line on `conversation.resumed`; New chat disabled while streaming.

2.7 Maintenance and Down: status notice replaces composer for chat and frame for embedded. Update `solution-viewer-maintenance.png` (composer must not appear).

2.8 Embedded viewer: frame fills the area under the header, loading skeleton, failure notice with Reload, Fullscreen control. New screenshots `solution-viewer-embedded.png` (desktop and phone), `solution-viewer-embedded-loading.png`.

2.9 Rich text: render fenced `mermaid` and `vega-lite` blocks as diagram and chart with plain code fallback; keep links to `https:` and `mailto:` only. Add one sample message with a Mermaid block to `data.json` and screenshot it.

2.10 Chat themes: header text color control with contrast pill; Phone and Desktop preview toggle; Save blocked while any pair fails; radius 0 to 28.

2.11 Access overview: empty states for a person with no access and a solution with no grants, each with Add access.

2.12 Design decision needed: the hub card for an embedded solution has no chat theme accent; use the solution's accent color for the monogram tile as for chat, and show a small "opens an external app" line under the description or rely on the Embedded pill. Pick one and apply consistently.

## 3. People, groups, and roles

3.1 Self-protection: disable Disable, Remove, and role-removal controls on the administrator's own row with a tooltip; when a person is the last Tenant administrator, disable those controls with "This is the last tenant administrator". Add `currentUserId` to the preview wrapper.

3.2 Pending local-account person: "Resend set-password email" on the Profile tab with last-sent time. Remove any manual "Mark as active" idea from copy.

3.3 People sort: name, status, last sign-in. Group chips on a person open that group's inspector.

3.4 Local groups: Delete with a confirm naming member count and role assignment count; "Remove all members" on the Members tab. Wire `onDeleteLocalGroup` and `onRemoveAllMembers`.

3.5 Role detail: keys added to Tenant administrator by entitlement carry an "added by entitlement" marker (from the earlier review, still open).

## 4. Account and inbox

4.1 Sessions: rename the column to IP address and read `session.ipAddress` (fall back to `locationHint` until data is renamed; then remove `locationHint`). Current session card first on phones.

4.2 Break-glass account variant: Profile, Change password (current password required, shared rule and meter), Authenticator (re-enroll), Sessions; no Preferences and no roles block. New screenshot `account-page-break-glass.png`.

4.3 Idle: no visual change, but the spec now says activity extends the server session silently; make sure the preview wrapper's countdown demo does not imply the modal appears on every timeout.

## 5. Sign-in and tenant pages

5.1 Password policy rules in `data.json` changed to the shared rule; the strength meter must evaluate exactly those rules and show each as met or unmet.

5.2 Authenticator enrollment step after the forced password change: QR code, manual key, one confirmation code. Screenshot `break-glass-sign-in-enroll.png`. A note that other pages redirect here until done.

## 6. Shell

6.1 Implement the "Cross-cutting behaviors" section: offline bar (fixed, red, top, `aria-live="polite"`, exact copy in the spec), no header theme toggle, collapsed categories persisted per device, drawer scrim that closes on tap, Focus mode slot, Administration lands on People, Back to workspace lands on Solutions, 44px touch targets, loading skeletons.

6.2 Rebuild responsive behavior mobile first as already required by `review-2026-09-16.md` A3, and add the three shell screenshots per chrome.

## 7. Design system

7.1 Apply `product/design-system/tokens.md` across every section: control heights (32/40/44), focus ring, pill taxonomy, table and card-list anatomy, form feedback roles, overlay sizes, toast behavior, empty state anatomy, skeleton and spinner, Lucide icon sizes, reduced-motion collapse, live regions.

7.2 Where a component today hard-codes a value the tokens file now defines (for example a 480px slide-over or a 4-second toast), keep the value if it matches and change it if it does not; do not invent new values.

## 8. Not designed yet, unchanged

Audit and Tenant Settings (with one section per entitled module that declares configuration; Chat Solutions declares none) and Email templates, as listed in the design roadmap.

Decided for Tenant Settings (`DEC-28`): module sections are rendered from a schema, not hand-designed per module. The renderer supports exactly five field kinds, and the placeholder module section must show all five with title, description, and one validation message each:

- string (text input; `pattern` and `maxLength` from the schema)
- number (number input with min and max)
- boolean (switch)
- enum (select)
- string list (add, remove, inline validation per item, item limit)

Save per card, each card with its own Save button that enables when dirty. The idle-timeout field shows a note that the change applies to new sessions.

## 9. From the second gap audit (2026-09-16, afternoon)

- `design-system/tokens.md` now defines the confirm dialog anatomy (Overlays). Every destructive confirm in People, Groups, Roles, Solutions, and Account uses it.
- People and Account already carry admin and self session sign-out; no change, but the screenshots must show the Sessions tab with "Sign out all".
- Not in scope for any screen, recorded as `DEC-32` in the platform decision log: avatar upload (initials only), self-service email change, member two-factor settings, remembered devices, chat attachments, theme presets, visible chat history on reopen. Remove any control that implies one of these.

## Verification

1. `npx tsc -b` and `npx eslint src/sections src/shell` pass.
2. Every screen has a phone and a desktop screenshot; the primary screens also in dark.
3. No horizontal scrolling at 390px.
4. Spec, `types.ts`, `data.json`, and components agree; deprecated fields (`locationHint`) are removed once components read the new ones.
5. The chat viewer screenshots show: reasoning disclosure, incomplete response, send error with Retry, feedback, continuing-conversation line, Maintenance notice without composer, embedded frame.
