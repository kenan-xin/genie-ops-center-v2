Record, not current. This file is history of one design round. It states positions that later decisions replaced. Read `../../core/decision-log.md` for what stands.

# Final design review, 2026-09-16

## Status, 2026-09-17: all items applied and verified

Every BLOCKING, MAJOR, and token item below is fixed. Verified on 2026-09-17: `npx tsc -b` passes, `npx eslint src` passes (the harness errors are fixed too), 257 screenshots across seven sections and the shell, every section carrying phone and dark captures, and all 25 preview screens fit a 390px viewport with no horizontal overflow. The forbidden-string and token greps in the Verification section return nothing.

Two items were met by a different route than this file proposed, both allowed by the brief:

- Phone primary actions render as a sticky bottom bar inside the page under 768px rather than through the shell `bottomBar` slot, because the section wrapper builds the shell itself and exposes no slot to a section page.
- An administrator editing the email of a local account is recorded as out of scope for this round in the people spec rather than designed.

Two further inconsistencies were found during verification and fixed: the workspace chrome sample showed the administrator labelled as a workspace member, and the user menu offered Change password on a brokered tenant. The shell spec now records which sample each user-menu screenshot shows.

Scope: all seven sections, the shell, and the design system, reviewed against the platform docs in `genie-ops-center-v2/docs`, the two earlier handover files, and the proven behavior of the earlier product. Five reviewers covered chat solutions; people, groups, roles, audit, and settings; sign-in, account, and shell; branding and email templates; and cross-section consistency. A browser pass at 390px confirmed no horizontal overflow on any of the 21 screens.

Build state: `npx tsc -b` passes. `npx eslint src/sections src/shell` passes. `npx eslint src` fails with 9 errors in the Design OS harness (`src/components/*`), outside the deliverable; see item M1.

Earlier handover files: `review-2026-09-16.md` and `handover-2026-09-16-gaps.md` are applied except where an item below says otherwise. Do not re-read them; this file supersedes both.

Severity: BLOCKING contradicts a recorded decision or breaks correctness. MAJOR means spec, types, data, component, or screenshot disagree, or a required state is missing. MINOR is copy or tokens.

Platform doc changes made today that the design must follow: `DEC-30` (operator-level allowed origins, per-solution `apiEndpoint`), `DEC-31` (hardening, no screens), `DEC-32` (capabilities not in the foundation), ADR 0006 and roadmap 3.6 (realm attributes are exactly company name, logo URL, primary color, primary foreground, sender name, support email; Keycloak emails use a system font stack and no footer links; digests are not in the catalogue), data shape (approved font keys `plus-jakarta-sans`, `ibm-plex-sans`, `manrope`, `source-serif-4`).

## BLOCKING (11)

B1. Chat, Status tab copy says sending still works in Maintenance. `src/sections/chat-solutions/components/ConfigureSolutionSlideOver.tsx:239-240`, visible in `admin-configure-status.png`. `DEC-27`: Maintenance and Down never stream. Fix both lines: "Members see your reason instead of the composer. Nothing is sent." (embedded: "instead of the application"). Ready help at `:238` must be type-aware.

B2. Chat, admin Preview is labeled only for Draft. `SolutionViewer.tsx:248` keys the banner on `status === 'draft'`. `DEC-27`: a preview of any solution is labeled and audited. Fix: add `preview?: boolean` to `SolutionViewerProps`, show the banner whenever true (Draft pill only when draft), add `solution-viewer-preview-ready.png`.

B3. People, the last-administrator rule is missing on the paths that actually strip the last administrator: `RoleDetail.tsx:129,157` (remove the only Tenant administrator assignment), `GroupInspector.tsx:66,110,140` (delete group, remove all, remove member of the administrators group), `PersonInspector.tsx:190`. Fix: one helper "would this leave zero active Tenant administrator holders" used by every removal path; add a sample state where only one holder remains and screenshot the disabled control with "This is the last tenant administrator".

B4. Destructive actions do not use the confirm dialog defined in `design-system/tokens.md` (Overlays). Inline strips at `PersonInspector.tsx:137`, `GroupInspector.tsx:62,84,109`, `RoleDetail.tsx:46`, `ConfigureSolutionSlideOver.tsx:260` (Archive), `ChatThemes.tsx:150` (theme Delete), `SolutionViewer.tsx` (New chat discard), `AccountPage.tsx:172-178` (Sign out all other sessions). `RolesDirectory.tsx:44,77` deletes a role with no confirm at all; per-row session Sign out has none. Fix: one `ConfirmDialog` on the existing `Dialog` (object in the title, one consequence sentence, Cancel focused, danger tone), used by every path listed.

B5. Shell, the desktop offline bar renders as a full-height red column. `src/shell/components/AppShell.tsx:158-160`; `product/shell/shell-desktop-offline.png`. Fix: `fixed inset-x-0 top-0 z-50` with root padding, or wrap sidebar and content in an inner `lg:flex-row` div.

B6. Shell, a header bell exists. `src/shell/ShellPreview.tsx:88-95`; shell spec Design Notes: no bell, notifications only through the Inbox nav item. Fix: delete it and regenerate the desktop and tablet shell screenshots.

B7. Account, the break-glass account page renders in the workspace chrome as Alex Morgan. `account-page-break-glass.png`; `src/shell/components/ShellWrapper.tsx:15` pins workspace mode. Spec: `/admin/account` in the admin chrome; `DEC-24`. Fix: read `?breakglass=1`, render admin chrome with the break-glass user, change the Profile description (no directory sync), regenerate both PNGs.

B8. Branding, the Email tab preview is a hand-drawn mock, not the template. `src/sections/branding/components/previews.tsx:92-120` versus `src/sections/email-templates/components/EmailBody.tsx`. Spec says it renders the real invitation template. Fix: `EmailPreview` = `MailClientFrame` + `EmailBody` with `invitation-brokered` and an `EmailTenant` derived from the draft; delete the mock.

B9. Email, the new-device sign-in template is missing. Catalogue (roadmap Section 1, item 8) and `DEC-32` require it; `email-templates/data.json` has none, gallery header says "Genie sends five" (`EmailGallery.tsx:57`). Fix: add `new-device-sign-in` (Genie sender, copy consistent with `core:session:new` in `account-and-inbox/data.json`), update header and spec.

B10. Email, a per-tenant sender address is invented. `MailClientFrame.tsx:32` `no-reply@{hostname}`; `email-templates/types.ts` hostname comment; email spec. `environment-contract.md`: one operator-set `MAIL_FROM`; the tenant sets display name and reply-to only. Branding `previews.tsx:98` uses a third address. Fix: one sample deployment address `no-reply@genie.example` in both sections; hostname only for links.

B11. Design roadmap references the previous codebase: `product/product-roadmap.md:9` "as in v1". Fix: delete the clause.

## MAJOR (38)

Cross-section data

M1. `npx eslint src` fails with 9 errors in `src/components/*` (harness). Either fix them or change the verification line to `eslint src` and make it pass; a half-green lint hides regressions.

M2. The placeholder module has two identities: `contracts` (not entitled) in `people-groups-and-roles/data.json:44-56`, `agreements` (entitled, with roles and a config card) in `audit-and-tenant-settings/data.json` and `email-templates/data.json`. Fix: one id, name, entitlement state, and role set across the three files; add its roles to the people data.

M3. Viewer permissions disagree. `chat-solutions/data.json:22` gives Alex `chat-solutions:admin` and grants on `sol_onboarding` and `sol_portal` that no assignment supports; people and account data make Alex a Chat user only. Fix: make Priya the chat admin viewer or drop the admin key and the ungranted ids.

M4. Idle timeout disagrees: 20 in audit and settings data, 15 in account and sign-in data. Fix: 15 everywhere; if the settings screen needs a changed value, show it as an unsaved edit.

M5. Break-glass email disagrees and uses the vendor domain: `ops-breakglass@stengg.example` in audit data versus `breakglass@meridianhealth.example` elsewhere. Fix: the Meridian address in audit.

M6. Primary color disagrees: `#2360c4` in sign-in data, `#2563eb` in branding and email. Fix: `#2563eb`.

M7. Account `roleGrants` lacks the Referral Letter Review grant that `ra_4` and notification `ntf_1` imply. Fix: add it.

M8. Break-glass account: `AccountAndInboxProps` lacks `passwordPolicy` and `authenticatorEnrolledAt`; `data.json` has `breakGlassUser` and `passwordPolicy` without model entries; `SignInAndTenantPagesProps` lacks `step`, `error`, `hostname`, `onGoToMemberSignIn`; `BreakGlassAdmin.steps` is unused. Fix: types, `_meta.models`, and components agree.

M9. Chat `Solution.type` is optional and present on 2 of 9 rows; `feedbackEnabled` on 1 of 8. `SolutionInput` lacks `type`, `feedbackEnabled`, `iframeUrl`, `allowFullscreen` (smuggled with `as Partial`); `ChatSolutionsProps` lacks `chatEnabled`, `onPreview`, frame state callbacks, `focused`. Fix: required `type` on every row, extend `SolutionInput` and props, add `chatEnabled` to data.

M10. People: `currentUserId` hard-coded in `PeopleDirectory.tsx:17`; add it to `data.json`. `Person` has no account type, so "Resend set-password email" appears for a brokered person (`people-inspector-resend-set-password.png`, Daniel, Entra) while `localAccountsEnabled` is false. Fix: `Person.accountType: 'brokered' | 'local'`; show the block and the "Genie (local password)" identity source only for local; branch the Add person copy.

Chat solutions

M11. Phone viewer header: Focus, New chat, and the overflow all render at 390px; the name is squeezed out and the "Chat" pill wraps under the monogram. `solution-viewer-mobile.png`, `-streaming-mobile.png`, `-embedded-mobile.png`; `SolutionViewer.tsx:215,227` intend `hidden md:inline-flex` but the shared `inline-flex` wins. Fix: resolve the class conflict, verify at 390px, regenerate.

M12. Embedded phone screenshot: name truncated, sandbox note wraps into a column, URL runs off the edge. Fix: hide the note under `sm` or `truncate min-w-0`.

M13. Admin Solutions desktop table overflows at 1280: Access header cut, Updated and row menu off-canvas (`admin-solutions.png`, `admin-solutions-row-menu.png`). Fix: drop Theme below `xl`, shorten description width.

M14. Chat themes "Used by" counts an embedded solution (`ChatThemes.tsx:95`; `chat-themes-default.png` lists Benefits Portal). `DEC-26`: embedded has no theme. Fix: filter `type === 'chat'` there and in the admin table theme name.

M15. Missing chat states in screenshots: open "Thinking" while streaming, "Reasoning interrupted", down-vote toast, New chat confirm, hub filter empty state with Clear filters, embedded in Maintenance or Down, phone register dialog and delete confirm; no dark screenshot for any chat screen.

M16. Phone primary actions are inline, not in the shell `bottomBar`: Register solution, Add on Categories, Add person, New local group, New role, Branding Discard and Publish. Shell spec and `DEC-25`. Fix: pass the primary button through `bottomBar` under 768px.

People, groups, roles, audit, settings

M17. Desktop tables clip: `roles-directory.png` Assignments header cut and row menu outside the card; `audit-log.png` action pills overrun the fixed 230px column into Target (`AuditLog.tsx:151`). Fix: shrinkable columns with truncation; wider or wrapping Action column.

M18. `people-row-menu-guarded.png` shows an unguarded menu (Amara Osei). Fix: capture on the current user and on a last-administrator row.

M19. `DEC-28` "one validation message each" is met for two of five kinds. `helpers.ts:105-137` has no boolean case; the enum can never be invalid; the number message is never screenshotted; the card footer is cropped. Fix: add the cases, screenshot each, include the footer showing Save disabled while invalid.

M20. Missing: `people-inspector-sessions.png` and its phone version (handover section 9 asked for it); dark screenshots for People, Groups, Roles; phone versions for 17 states listed by the reviewer (inspector tabs, guards, group confirms, role forms and assignments, audit empty, filtered and JSON, settings brokered and validation).

M21. Directory-group Archive appears only inside the stale banner (`GroupInspector.tsx:83-92`); spec and data shape: every directory group can be archived. Fix: Archive in the header actions.

Sign-in, account, shell

M22. No toast anywhere in these sections; account spec says preference saves confirm with a toast; break-glass password save uses an inline span (`AccountPage.tsx:150`). Fix: a toast primitive per tokens, used for both.

M23. Mono chips not used: "This device" is a blue label pill (`AccountPage.tsx:193,222`), the user footer role is plain text (`UserMenu.tsx:132`). Fix: a `MonoChip` (JetBrains Mono, uppercase) in both places.

M24. Password rule 4 ("not the provisioning password") is shown as met client-side (`BreakGlassSignIn.tsx:184`, `helpers.ts:23`; `break-glass-sign-in-change-password.png` all green with Current password empty). Rule 3 adds a local-part check not in `DEC-24`. Fix: rule 4 neutral "checked on submit", excluded from the score; rule 3 exactly "not equal to the email".

M25. Touch targets under 44px in the drawer: nav rows `h-10`, solution and category rows `h-9` (`MainNav.tsx:66,102,138,184`); copy-key button `size-8`; row menu trigger 32px (`ui.tsx:174` in people). Fix: `min-h-11` under `lg` or invisible padding.

M26. Enrollment card lacks the redirect note ("every other page brings you back here") that only the change-password card carries (`BreakGlassSignIn.tsx:347`).

M27. Sample notification names a city: `account-and-inbox/data.json:70` "New sign-in from Kuala Lumpur". Data shape: IP address, never a location. Fix: "New sign-in on macOS, Chrome 130".

M28. `account-page-mobile-sessions.png` is mislabeled (shows break-glass password and authenticator blocks). Replace with the phone sessions card list.

M29. `shell-desktop-admin-menu.png` shows the workspace menu; capture the admin chrome menu with Back to workspace. No dark shell screenshot exists for either chrome.

M30. Solutions empty state renders a grid icon; spec says the tenant letter tile (`SolutionsEmptyState.tsx:17`).

Branding and email

M31. Upload progress and infected refusal are copy only. `BrandingPage.tsx` `upload()` inserts at `pending` instantly; no progress bar, no refusal notice (`role="alert"`), no screenshots. Fix: add both states and screenshot them.

M32. Keycloak templates offer "Send test to me" and the Plain text toggle (`EmailGallery.tsx`, `email-kc-*.png`). Genie has neither for realm emails. Fix: disable both with "Sent by the realm theme; test from the realm".

M33. Keycloak templates render footer text, support URL, Terms and Privacy, "Sent by", and the tenant font. ADR 0006 (updated today): the realm receives company name, logo URL, primary color, primary foreground, sender name, support email, and uses a system font stack with no footer links. Fix: render Keycloak templates with only those values; correct the Branding Email tab note.

M34. Two different foreground rules: branding `helpers.ts` (luminance 0.4) versus email `helpers.ts` (higher ratio). Data shape stores `primary_foreground` once. Fix: one shared rule; add `primaryForeground` to `EmailTenant` and read it.

M35. Published sample fails the AA rule: accent `#7c3aed` shows "Dark 4.2:1" failing in the Published state (`branding-colors.png`) while Publish is blocked on any failing pair. Fix: seed a passing accent; keep the failing state as a draft edit.

M36. No logo image is ever shown: every `BrandingImage.url` is null; `EmailTenant` has no logo field. Fix: a small data-URI SVG sample for logo and mark; `logoMarkUrl` on `EmailTenant` with a letter-tile fallback.

M37. Keycloak link host and realm are wrong: `https://id.{hostname}/realms/meridian/...` appears for Northwind; `KEYCLOAK_URL` is one base URL. Fix: `keycloakUrl` and `realm` on `EmailTenant`.

M38. Missing branding screenshots: phone for Sign-in, Email, Links, Publish dialog, Colors failing and fixed; branding page in dark; upload in progress; infected refusal.

## Tokens applied inconsistently (fix as one pass)

T1. Hard-coded pixel type sizes across sections (`text-[17px]`, `text-[13.5px]`, `text-[12.5px]`, `text-[11.5px]`, `text-[10px]`; 19 uses in `AccountPage.tsx`, 18 in `BreakGlassSignIn.tsx`, 11 in `MainNav.tsx`). Tokens: never a hard-coded pixel size. Define the scale utilities once and replace.

T2. Control heights outside 32/40/44: `h-9` (13 uses, including every `btnDanger`), `h-12` sign-in button, `h-13` code boxes, `h-7` chips and the Fix button. Only `h-8`, `h-10`, `h-11`.

T3. Focus ring: inputs use `ring-blue-500/30` without offset; many links and icon buttons have no `focus-visible` ring. One shared `focusRing` class = `outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2`.

T4. Pill taxonomy: Draft, Pending, Scanning, unpublished changes, and Not entitled must be gray; amber only for Maintenance and Stale. Offenders: `RolesDirectory.tsx:40`, `BrandingPage.tsx:173,280-281`, branding `ui.tsx:30`.

T5. Icons: nav `size-[18px]`, button icons `size-3.5`, pill icons `size-3`. Tokens: 16px in text and pills, 20px in buttons and nav.

T6. Radius: 57 `rounded-lg` and 17 bare `rounded` uses; menus 8px, controls 12px, cards 16px, pills full.

T7. Toasts lack a manual close (gallery, audit); `animate-spin` and transitions without `motion-safe:` or `motion-reduce:` (branding sync pill, category chevron, idle progress).

T8. Table anatomy: header row must be small semibold gray-600 on gray-50 with row hover; account sessions table and card-list padding do not follow it.

T9. Idle dialog `max-w-sm` (384px) versus 480px token, and centered on phones versus full-width with a bottom bar. Spec and tokens disagree; align the spec to the tokens.

T10. Page gutters `px-3 lg:px-4` versus 16/24/32 tokens.

## MINOR (selected; full lists in the reviewer notes)

- Copy: "admin portal" in `product-overview.md:21`, `product-roadmap.md:12,15`, email spec; everywhere else says console. Use console.
- Identity provider naming drifts ("Microsoft Entra ID", "Meridian Entra ID", `entra`, hosts `sso.example`, var `--login-bg`). One label; drop `sso` and `login` from sample names.
- `product-overview.md` Key Features omit Email templates; `data-shape.md` says User while specs say person.
- Audit data summary leaks a repo path (`customers/meridian/deploy/tenant.yaml`); write "the tenant configuration".
- Spec defects: account spec line 10 garbled ("No Preferences roles block changes."); sign-in spec two conflicting Enrollment sentences; email spec lacks the "Designed mobile first" line; people spec line 47 is about uploads and belongs elsewhere.
- Chat: limits not enforced in inputs (`externalBotId` 200, `welcomeText` 2000, placeholder 140, prompt 8000); register default monogram is two letters, not initials; select chevron floats on phones; configure tab strip clips "Access" with no scroll hint; theme Delete hidden instead of disabled for the default theme; `text-gray-400` for the Theme dash.
- People and audit: footer "Showing 28 of 1,284" with a disabled Load more; custom date range hard-coded; "⚙" glyph as icon; JSON block near-black in light theme; `aria-describedby` to a missing id; fixed dialog title id; role name and assignment uniqueness not validated; Tenant administrator offered a per-solution scope; Sign out all has no confirm.
- Sign-in and account: preview toolbar and cursor captured in several PNGs; notice checkbox copy differs from spec; time zone select uses a `▾` glyph and is not searchable; AuthFrame reveal 420 ms; strength meter uses red and amber; invented "Member sign-in" link, hostname label, "Tip" pill, idle progress bar, step counter (add to spec or remove); header search placeholder "Search solutions" on People; notification `ntf_2` "Conversations are kept." contradicts `DEC-27`.
- Branding and email: Northwind emails addressed to a Meridian person; `EmailBody` prints "Need help?" twice; branding preview paints the email dark in dark mode (emails stay light); spec says Keycloak badge in list and frame header but the list has none; `[Test]` subject prefix never shown; role-removed "nothing left" variant has no data or screenshot; `SyncStatus.failed` exists in types with no spec or screenshot; `beforeunload` only, no in-app leave dialog; locale preview shows a Currency row that is not a branding field; Keycloak link lifetimes are invented (remove).
- `tsconfig.app.json:28` `baseUrl` is deprecated; `paths` alone works.

## Accepted as is

- Third sample tenant "Harbour Financial" on the suspended tenant page.
- Operator name in `product-overview.md` (the operator is not a customer).
- Chat spec Out of scope naming presenter mode and theme presets.
- Sign-in banner tones follow the spec (blue for signed out and expired, amber for not registered and disabled).

## Verification for the next round

1. `npx tsc -b` and `npx eslint src` pass (or the lint scope is changed in this file and passes).
2. Every PNG named above exists; every desktop screenshot has a phone counterpart; every primary screen has a dark screenshot; no toolbar or cursor in captures; all phone captures at 390x844, desktop at 1280x900.
3. `grep -rn --exclude='review-*' --exclude='handover-*' "Sending still works\|as in v1\|Kuala Lumpur\|stengg.example\|no-reply@meridian\|no-reply@northwind\|isAdmin\|approvedOrigins\|endpointOrigin\|locationHint\|scanning" product src` returns nothing.
4. `grep -rn "text-\[[0-9.]*px\]\|\bh-9\b\|\bh-12\b\|\bh-13\b\|\bh-7\b" src/sections src/shell` returns nothing.
5. Spec, `types.ts`, `data.json`, and components agree in every section; `_meta.models` lists every top-level data key.
6. The break-glass screenshots show the admin chrome; the offline desktop screenshot shows a top bar; no bell in any shell screenshot.

## Counts

BLOCKING 11, MAJOR 38, token passes 10, MINOR about 60 across the five reviewer notes.
