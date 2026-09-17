Record, not current. This file is history of one design round. It states positions that later decisions replaced. Read `../../core/decision-log.md` for what stands.

# Fix report for findings.md, 2026-09-17

Status: every item in `findings.md` is fixed or decided and applied, except N6, listed under Still open. Earlier review files (`review-2026-09-16.md`, `handover-2026-09-16-gaps.md`, `review-2026-09-16-final.md`) were fully applied before this pass.

Scope: every item in `findings.md` that a recorded platform decision already settles. Items that need a decision from the product owner are listed at the end and were not touched.

Verification after the pass: `npx tsc -b` clean, `npx eslint src` clean, all seven `product/sections/*/data.json` parse, every screenshot group retaken (242 captures), and the six retired captures deleted.

## Fixed without a decision

### B1. Hostname routing removed
What happened: the overview, the sign-in spec, its data, its types, and `AuthFrame` still described tenant resolution by hostname. ADR 0007 and `DEC-4` give every deployment one `PUBLIC_URL` and forbid hostname inspection.
Fix: the overview now says one deployment per customer with one public URL. The sign-in section lost the `hostname` prop and field, the `tenantStatus` data, and the tenant-resolution flows. The mono label under every auth card is now the product name from branding.
Reason: a link base is still a fact, so the product name keeps the card anchored without teaching a routing model that does not exist.

### B2. Tenant-status pages replaced by the not-set-up page
What happened: tenant-not-found and tenant-suspended were designed, but ADR 0007 removed both states. The platform roadmap requires a not-set-up page instead.
Fix: `TenantStatusPage` and its six captures are deleted. New `NotSetUpPage` shows the product name, the heading, the `genie-ops setup` line, the eight `setup_step` rows with pending, done, or failed and the failure detail, a done counter, no button, and a support line only when branding provides one. Preview flags: default (partial) and `?fresh=1`. The roadmap Section 1 description now names this page.
Reason: the page mirrors `setup_step` one to one, so the implementer reads the table and renders rows.

### B3. Realm branding sync removed (DEC-40)
What happened: Branding still queued a realm-attribute sync with a Synced, Pending, or Failed pill, and the email gallery rendered the three Keycloak emails in tenant branding.
Fix: `SyncStatus`, `syncState`, the pill, the `?sync=` preview flag, and the Publish text about the sync are gone. The Email tab note now says the sender name and reply-to also apply to the realm SMTP settings, and that the credential emails are Keycloak's built-in templates that print the realm display name only. The three Keycloak emails render unstyled with Keycloak's built-in wording and subjects, labeled "Sent by Keycloak built-in template". The gallery premise changed from proving a visual match to showing the recipient what they get and why it differs, with the later branded option recorded per ADR 0006.
Reason: the design must not promise a theme the platform decided not to build.

### B4. Upload limit is 15 MB (DEC-44)
Fix: `uploadPolicy.maxBytes` is 15728640, the spec and every drop zone say 15 MB.

### B5. Module renamed to `solutions`
What happened: the section, the permission keys, the role names, the audit and notification kinds, and the `tenant_module` id all used `chat-solutions`, which the platform never mounts.
Fix: folders moved to `product/sections/solutions` and `src/sections/solutions`; keys are `solutions:admin` and `solutions:use`; roles are `Solutions administrator` and `Solutions user`; audit actions and notification kinds are `solutions:*`; admin routes are `/admin/solutions/...`; the roadmap section is "5. Solutions". "Chat" stays only as the solution type label and in Chat themes. Internal ids `role_chat_admin` and `role_chat_user` were kept because nothing user-visible reads them.
Reason: keys are compiled into `can()` calls and seeded roles, so a label change is not enough.

### B6. File bytes rule corrected
Fix: the data shape now says the bytes live in `file_blob` by default or in a bucket with the `s3` adapter, `scan_status` stays `skipped` until a scanner exists, and the default limit is 15 MB.

### B7. Control plane removed from the data shape
Fix: the Tenant entity became Deployment: one customer, one image, one database, one realm, no tenant row, with the three deployment tables the platform names (TenantModule keyed on module id, SetupStep, Retirement with retired_at and deletion_hold). The status enum and the Tenant to TenantModule arrow are gone.

### B8. Group sync rule corrected (text only)
Fix: the data shape says a present claim, even an empty one, replaces identity-provider memberships, and an absent claim keeps them and writes `auth:groups_claim_absent`. The Groups screen state for the absent case is a decision and is listed below.

### B9. Break-glass first sign-in order
What happened: the code step rendered in every run, so a first sign-in asked for a code before any authenticator existed.
Fix: `breakGlassSteps(admin)` in the section helpers returns credentials then code for an enrolled account, and credentials, change password, then enroll for a first sign-in. The step counter follows. Preview `?enrolled=1` shows the enrolled door.
Reason: the platform roadmap Section 2 item 11 fixes this order.

### M6. Unreachable upload states marked
Fix: the branding spec states that Scanning and Infected are kept in the design but not reachable in the first release, and that the implementer must not fake them. The drop-zone copy no longer claims SVG sanitizing; it names the accepted types and says scanning is recorded as skipped. The SVG sanitizer question itself is listed below for the platform owner.

### M8. Refusal states added (DEC-31)
Fix: break-glass sign-in has a rate-limited state (`?limited=1`) with a neutral notice "Too many sign-in attempts. Try again in N minutes." and disabled inputs. Add person and Resend set-password have the same pattern (`PeopleDirectory?ratelimited=1`). A new `LimitedSessionPage` ("Finish setting up your account") shows the two-item checklist and one Continue setup button for a limited session (`?done=password`).
Reason: the platform audits every refusal, so each needs a screen a tester can reach.

### M9. Placeholder module is `contracts`
Fix: every `agreements` id, permission, label, and URL became `contracts` (module Contracts, `contracts:admin`, record type contract, `CTR-2024-118`). `approvals:*` keys stay because Approvals is a real platform module.

### N2 and N3. Overview wording
Fix: the overview says each customer's image is built from the one Dockerfile with only that customer's modules (`DEC-33`), and that operators run each deployment with the `genie-ops` command line inside the image.

### N4. Token file names the export target
Fix: `tokens.md` says `focusRing` and `MonoChip` live in the shell folder in this tree and move to `packages/ui` on export.

### N5. Email gallery labels two sample deployments
Fix: the select is "Sample deployment", and the spec, header, and `_meta` explain that one deployment serves one customer and the second sample only proves that templates follow branding.

### Extra: new-device sign-in email aligned
The platform catalogue names a new-device sign-in email. The template now carries the `core:session:new` trigger, device, IP address, time, and a Review sessions button. `EmailTenant.hostname` became `publicHost` (the host of `PUBLIC_URL`).

## Decided on 2026-09-17

### M2. Inbox kept, entry hidden
Decision: keep the design, hide the navigation entry and the unread pill until the platform schedules the inbox. Applied: the shell spec and the account section spec carry the deferral note; the shell previews hide the entry unless `?inbox=1` is set.

### M5. Resolver returns a path
Decision: extend the module contract's record-type resolver to return a label and an optional path; core shows Open only when a path is present. Applied in the audit spec. Text for the platform's `module-contract.md`, Record types row: "a resolver from id to `{ label, path? }`; core renders a link only when `path` is present, and it must be a route the caller may open under `can()`."

### M1. One brand color, neutral shell (Option 1)
Decision: Branding keeps `primaryColor` only; secondary and accent leave Branding and the platform. The primary fills the shadcn `--primary` variables and shows as small shell accents (active nav row, primary buttons, focus ring, count pills), the sign-in page, and emails; sidebar and page chrome stay neutral. Contrast rules are unchanged. Research: `product/research/theming-2026-09-17.md`. Applied in Branding, shell spec, tokens, and data shape.

### Landing page
Superseded by `DEC-49` on 2026-09-17: no core page named Dashboard exists. The landing route after sign-in is the solutions module's own hub, marked on its navigation entry, and the shell entry is named Solutions again. The empty state for a member with no grants ("No solutions yet", ask your administrator) stays on the hub. A later Dashboard in core reopens through the dashboard widget slot on the contract's not-built list.

### M3 and M4. Sidebar variant A
Decision: the pinned rail, the category tree, and the Favorites entry stay. The Favorites page is designed in the Solutions section, and the shell spec carries the navigation-tree slot text for the module contract. The prototype was removed after the choice.

### M7. Chat theme default is a seed
Decision: the Tenant branding chip is rendered from branding values, not a stored row; no default flag in `chat_theme`.

### B8, second half. Absent-claim state out of scope
Decision: no Groups screen state; the audit reader shows the event. Recorded in the People, Groups, and Roles spec.

### M6, second half. SVG sanitizing
Decision: core sanitizes SVG on upload under `DEC-20`; the design shows no sanitizing state and raises nothing.

### N1. Admin portal
Decision: adopt the platform term. "Admin console" becomes "Admin portal" across specs, the shell chip, and copy.

### Typography in Branding
Decision: the administrator sets the font (from the approved list), a font size preset (compact 14 px, default 15 px, large 16 px root size; the scale is rem-based), and the light-theme text color, checked at 4.5:1 against white and the gray-50 subtle surface with Fix and blocked Publish; dark keeps its fixed gray-100. Applied as a Typography tab between Colors and Sign-in, with captures `branding-typography*.png`. Secondary color stays out: no surface uses it; add it back only with a named surface and its own pair check.

## Still open

- N6. What lands in the platform's `docs/design/` and who checks it when a `DEC-` entry changes. Suggested: copy `product/` (specs, data, types, captures, tokens, shell spec) into `docs/design/` on every design handover, and add one line to the decision-log template, "Design files affected", that the author fills in.

## Superseded list (kept for the record, all resolved above)

- M1. Whether the shell follows the tenant primary color, stays blue, or the platform drops secondary and accent. Largest open item; blocks any token work.
- M2. The Inbox is designed but the platform defers it. Pull it forward, or hide the nav entry and mark the section as delivered early.
- M3. Pinned rail, category tree, and Favorites entry need a navigation-tree slot in the module contract, or the sidebar flattens.
- M4. Favorites page: design it, or drop the entry and let the pinned rail carry favorites.
- M5. Audit Open link needs the record-type resolver to return a path, or the sheet shows the label only.
- M6, second half. SVG sanitizing is promised nowhere in the platform; the platform owner decides whether to add it.
- M7. Chat theme default: a client-side seed the spec must name, or a platform flag.
- B8, second half. Whether Groups shows the absent-claim state (memberships kept, event written) or records it out of scope.
- N1. Admin console (design) versus admin portal (platform). One term for both trees.
- N6. What lands in `docs/design/` and who checks it when a `DEC-` entry changes.
