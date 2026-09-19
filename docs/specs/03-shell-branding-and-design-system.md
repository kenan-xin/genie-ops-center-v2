Confidence: 8.1/10

Business scenario: [CF-MA-01](../flows/module-access-upgrades.md) describes configuring a newly delivered module before explicit activation. R-84a must support this journey; the flow is not evidence that the delivered design already includes the pre-enable state.
Reasoning: Every platform document and every design file that serves this section was read, and each requirement below is traced to a roadmap item, a decision id, a data-shape column, a design heading, or a row of the cross-section call table in `README.md`. The integration pass closed the three document drifts this draft had found and settled the font list, the landing-route fallback, the hub entry placement, the idle-timeout seam, and the optional `configSchema`; the decisions of 2026-09-18 settled the email gallery and the realm capability column, so no open question remains. A cross-specification review found that the first draft had carried no migration requirement at all, which is now R-86a, and that finding keeps the score modest. Nothing is built, so the per-request token layer, the one navigation tree, and the contrast checks are proven only on paper, and five of the eleven work items land after Section 2 and consume a seam that does not exist yet.
Status: Draft — awaiting user approval

## Goal and scope

Section 3 delivers the look and the frame of Genie Ops Center: the fixed token layer in `packages/ui`, the tenant token layer emitted per request from `tenant_branding`, the design-system primitives, the one shell in `packages/core` with its two chromes, the Branding pages, the branding read on the sign-in page and in the React Email templates, personal overrides on the account page, the accessibility gate, the Tenant Settings page with `ConfigForm`, and the Modules and Categories pages.

In scope, by roadmap item (`../core/roadmap.md`, "Section 3: Shell, branding, and design system"):

1. Fixed token layer.
2. Tenant token layer.
3. Primitives in `packages/ui`.
4. Shell in core.
5. Branding pages.
6. Sign-in page and email templates read branding.
7. Personal overrides in `user_preference`.
8. Section designs reviewed one at a time.
9. Accessibility.
10. Tenant Settings page.
11. Modules and Categories pages.

Excluded, with the owner named:

- The sign-in page itself, the break-glass sign-in page, the account page frame, the sessions block, and the roles summary. Section 2 items 4, 7, and 11 build them. Section 3 adds the branding read and the Preferences block.
- The audit reader screen. Section 2 item 12 builds it. Section 3 writes audit events that it reads.
- `can()`, `scopesFor()`, `role`, `role_assignment`, and the group sync. Section 2 item 6 builds them. Section 3 consumes them.
- The solutions hub, the solutions navigation entries, the pinned rail contents, chat themes, and the Access overview screen of the solutions admin. Section 4 and `../modules/solutions/README.md` own them.
- The inbox screen and its unread pill. Deferred by `DEC-21` to Section 5 item 8. The shell hides the entry.
- A core page named Dashboard and a landing-slot contract point. Refused by `DEC-49`.
- The `s3` file adapter, malware scanning, CSV export, and SIEM push.

Order inside the section (`../core/roadmap.md`, "Order and parallelism", which now names item 11 among the dependent items). Section 3 starts when Section 1 is done. Items 1, 2, 3, 6, 8, and 9 run beside Section 2. Items 4, 5, 7, 10, and 11 need the access seam of Section 2 item 6 and the account page of Section 2 item 4, and follow them.

## Sources

- `../core/roadmap.md`: "Section 3: Shell, branding, and design system", items 1 to 11 and the definition of done. "Section 0: Monorepo foundation" items 3, 4, 9, and 11. "Section 1: Deployment and setup" items 1, 7, and 8. "Section 2: Identity and access" items 4, 6, 7, 8, and 12. "Order and parallelism".
- `../core/vision.md`: "Features", the Branding list, the Shell line, and the Design system line. The "Decided" table.
- `../core/decision-log.md`: `DEC-13`, `DEC-21`, `DEC-25`, `DEC-28`, `DEC-40`, `DEC-46`, `DEC-47`, `DEC-49`, `DEC-50`, `DEC-51`. Also `DEC-20`, `DEC-23`, `DEC-39`, `DEC-44`, `DEC-45`, `DEC-48`.
- `../architecture/data-shape.md`: "Deployment tables" (`tenant_module`), "Tenant settings" (`tenant_settings`), "Navigation" (`category`), "Roles and permissions" (`role`, `role_assignment`), "Branding" (`tenant_branding`, `user_preference`), "Files" (`file`), "Audit" (`audit_event`).
- `../architecture/module-contract.md`: the Navigation, Pages, Permission keys, Default roles, and Configuration schema rows, and the "What core provides to a module" UI line.
- `../architecture/repository-layout.md`: "Layout" for `packages/ui` and the `packages/core` shell, and "How a customer's requirement is met" levels 1 and 8.
- `../architecture/environment-contract.md`: "Mail" (`MAIL_FROM`), "Required" (`PUBLIC_URL`), "Files" (`FILE_MAX_BYTES`).
- `../core/tech-stack.md`: "Web application" (Next.js 16, React 19, Tailwind 4, shadcn on Base UI, TanStack Form, zod 4, next-intl), "Quality" (axe-core through Playwright, Vitest browser mode), "Communication" (React Email).
- `../design/README.md`: the design round table and the standing check on `types.ts`.
- `../design/reference/README.md`: rules 1 to 5 for reading the reference components.
- `../design/design-system/tokens.md`: the whole file.
- `../design/shell/spec.md`: the whole file.
- `../design/sections/branding/spec.md` and `types.ts`.
- `../design/sections/email-templates/spec.md` and `types.ts`.
- `../design/sections/account-and-inbox/spec.md` and `types.ts`.
- `../design/sections/audit-and-tenant-settings/spec.md` and `types.ts`.
- `../design/research/theming-2026-09-17.md`: the evidence behind `DEC-47`.
- `../modules/solutions/README.md`: the approved font list used by chat themes, the default chat theme, and the Access overview.
- `README.md` in this folder: the common format, the section-boundaries table, the table "Cross-section calls made in the drafting round", and the terminology.

## Requirements

### Fixed token layer (item 1)

R-1. `packages/ui` must carry the fixed token layer as the one source of the type scale, control heights, radius, spacing, elevation, motion, the focus ring, and the color roles. The values are those of `../design/design-system/tokens.md`. No other package restates a value from that file.

R-2. The type scale must be the six roles of `../design/design-system/tokens.md`, "Type scale": display, title, heading, body, secondary, caption, each bound to one Tailwind text utility and one weight. Display and title step down one size below the `lg` breakpoint.

R-3. Every text size must be rem-based so that the tenant root font size moves the whole scale with no per-component change (`DEC-47`, `../design/design-system/tokens.md`, "Type scale").

R-4. An arbitrary pixel text size must not appear in any package. A repository check must fail the build when a source file matches an arbitrary pixel text utility. The check is the one named in `../design/design-system/tokens.md`, "Type scale", run over `packages/ui`, `packages/core`, `packages/modules/*`, `apps/*`, and `customers/*/app/`, and it must run in the pull request pipeline beside lint.

R-5. Control heights must be one scale: 32 px, 40 px, and 44 px, with 40 px the default and no other height class on a control. The heights are fixed pixels at every font size preset, so a touch target keeps its size when a tenant picks the compact preset (`../design/design-system/tokens.md`, "Control heights", which resolves the trade-off `DEC-47` left to the design). Below the `lg` breakpoint every interactive row and icon button is at least 44 px tall (`../design/shell/spec.md`, "Cross-cutting behaviors").

R-6. Radius, spacing, and elevation must follow `../design/design-system/tokens.md`, "Radius, spacing, elevation, motion". Borders carry separation. Only dialogs, sheets, and menus carry a shadow.

R-7. Every `transition-*` and `animate-*` utility must be written under `motion-safe:`, or paired with a `motion-reduce:` reset. Motion lasts 150 to 220 milliseconds with an ease-out curve, with no bounce and no scale, and collapses to no motion under `prefers-reduced-motion` (`../design/design-system/tokens.md`, "Radius, spacing, elevation, motion").

R-8. One exported constant must hold the focus ring class string, and every focusable control must append it. No component writes its own ring classes and no component sets `outline: none` without the ring. The constant moves from the design tree into `packages/ui` unchanged (`../design/design-system/tokens.md`, "Focus ring").

R-9. The color roles must be those of `../design/design-system/tokens.md`, "Color roles". The tenant color fills solid surfaces and the focus ring only. Every tinted surface that stands for identity or a label stays a fixed neutral gray, the avatar background and the Admin portal pill included. A tint that carries state or meaning keeps its fixed informational color and is not brand. Hover is the same color at 90 percent opacity and press at 80 percent, never a derived shade (`DEC-47`, amendment of 2026-09-17).

R-10. Every font face must be self-hosted in the image, subset to latin and latin-ext, served with `font-display: swap`, and the one weight the sign-in page paints first must be preloaded. No font is fetched from a third-party font service at run time, on any page, so a regulated customer sees no outbound request from the sign-in page (`../design/design-system/tokens.md`, "Type scale").

R-11. The approved font list must be a constant in `packages/ui` holding the keys of `../architecture/data-shape.md`, "Branding": `plus-jakarta-sans` (default), `ibm-plex-sans`, `manrope`, and `source-serif-4`. All four families ship self-hosted in the image, because the list grows only by a pull request that adds the font files, so a key the Branding page offers always renders (`README.md` in this folder, "Cross-section calls made in the drafting round", Fonts row). The mono face is fixed and is not a tenant choice. The same constant is what the solutions module's chat themes read for their font field (`../modules/solutions/README.md`, `chat_theme`).

### Tenant token layer (item 2)

R-12. The application must emit the tenant token layer as CSS custom properties per request, from `tenant_branding` read through the branding reader on the tenant context, and from nowhere else (`../core/roadmap.md`, Section 3 item 2, `DEC-34`, `DEC-46`).

R-13. The emitted color variables must be `--primary` and `--primary-foreground` only. `--primary` takes `tenant_branding.primary_color` and `--primary-foreground` takes the stored `tenant_branding.primary_foreground`. No tint ramp is derived, no color-space computation runs in `packages/ui`, and no per-step contrast check exists (`DEC-47`, `../architecture/data-shape.md`, "Branding").

R-14. The emitted typography variables must be the root font size from `tenant_branding.font_size` (compact 14 px, default 15 px, large 16 px), the font family from `tenant_branding.font_family`, and the light-surface text color from `tenant_branding.text_color` filling `--foreground`. The text color must not apply in the dark theme, which keeps its fixed value (`DEC-47`, `../design/sections/branding/spec.md`, "Design notes").

R-15. The dark theme must keep the fixed starting points pinned in `../design/design-system/tokens.md`, "Color roles": the brand as text or icon and the focus ring take the lighter dark-theme step, and a solid brand fill keeps its light-theme value with its computed foreground.

R-16. The emitted variables must be carried on the document root in a style element; the minimal CSP does not require a nonce (`../core/roadmap.md`, Section 0 item 11, `DEC-31`). A route that renders the shell or the sign-in page is request-bound because it reads branding, and the implementation must accept that rather than cache the markup across tenants.

R-17. Resolving the theme must not flash the wrong theme before hydration. The resolved theme is written on the document root by the server when it is known, and the client corrects it before paint when the person's preference is `system`.

R-18. A branding change must show on the next page load in a process whose branding reader cache has expired, within the 10 second window of `DEC-46`. Nothing invalidates the cache on save, and no process restarts.

### Primitives (item 3)

R-19. `packages/ui` must ship Button, Input, Select, Dialog, Table, Toast, Switch, and Tabs, built on shadcn over Base UI (`@base-ui/react`) as `../core/tech-stack.md`, "Web application", fixes the stack. Every primitive reads the token layer and never hard-codes a value the token layer owns.

R-20. Every primitive must take the one control height scale of R-5 and the one focus ring constant of R-8. A row that mixes controls renders all of them at the default height (`../design/design-system/tokens.md`, "Control heights").

R-21. Button must carry the five variants and the four states of `../design/design-system/tokens.md`, "Buttons". The disabled state uses `aria-disabled` rather than the `disabled` attribute when the control must stay focusable to explain why. The loading state keeps the label and the control width, sets `aria-busy`, and ignores a second press.

R-22. Dialog must be 480 pixels wide and centered above the 768 pixel breakpoint and full width anchored to the bottom with a bottom action bar below it, for every dialog including the idle-timeout countdown. Focus is trapped and Escape closes unless a specification says otherwise. One `ConfirmDialog` built on Dialog must serve every destructive path in every section, with the signature and the focus rule of `../design/design-system/tokens.md`, "Overlays".

R-23. Table must become a card list below 768 pixels, one card per row with identity, status pill, and one or two scan facts, with actions in an overflow menu and no horizontal scrolling. A clickable row is reachable by keyboard, carries a role, and opens on Enter and Space (`DEC-25`, `../design/design-system/tokens.md`, "Tables and card lists").

R-24. Toast must place itself bottom centre below 768 pixels and bottom right above it, auto-dismiss after 4 seconds with a manual close, stack at most three, and carry `role="status"` (`../design/design-system/tokens.md`, "Toast").

R-25. `packages/ui` must also ship the shared parts the sections name: the empty state block, the skeleton loader, the spinner with `role="status"` and a visually hidden label, the status pill, the label pill, the mono chip, and the count pill (`../design/design-system/tokens.md`, "Pills and chips", "Empty state", "Loading").

R-26. `packages/ui` must import nothing internal (`../core/roadmap.md`, Section 0, "Rules enforced from day one"). A primitive that needs tenant data is wrong. The tenant layer reaches it through CSS variables only.

### Shell (item 4)

R-27. `packages/core` must hold one shell component with two chromes, the member workspace and the admin portal, sharing one anatomy and carrying different navigation. The shell must be composable by any app, including a custom app under `customers/<slug>/app/`. A shell capability that works only inside `apps/genie` is a defect (`../architecture/repository-layout.md`, level 8).

R-28. The shell must build the navigation from three inputs and nothing else: the entitlements from `tenant_module.enabled`, the permissions answered by `can()`, and the core `category` table. Core must never read a module table to build the tree (`DEC-51`, `../architecture/module-contract.md`, Navigation row).

R-29. The tree the shell renders must be the one contract shape, `{ pinned: Entry[], entries: Entry[] }`, with at most six ordered pinned entries and an optional `categoryId` on an entry. Core groups entries under the `category` rows, places a module's static workspace entries under `tenant_module.category_id`, sorts inside a category by label with module and record entries mixed, and puts entries with no category and entries whose category id no longer exists into one ungrouped area. The headings above the tree and the sort order inside a category are the design's choice and stand (`DEC-51`, "Left to the design", `../design/shell/spec.md`, "Navigation Structure").

R-29a. A module's static workspace entry whose `tenant_module.category_id` is null must render in the workspace block above the category tree, and the same entry must render under the category heading once an administrator picks a category on the Modules page. The landing-route flag does not depend on that placement (`DEC-50`, `../design/shell/spec.md`, "Navigation Structure", `README.md` in this folder, "Cross-section calls made in the drafting round", Hub entry placement row).

R-30. The shell must send a person after sign-in to the workspace navigation entry marked the landing route. At most one entry across all compiled modules may carry the flag; zero is valid, and the module registry must fail the build when two do. When no entitled module declares one, or the person cannot reach the one that does, the shell must open its no-grants empty state instead. Core knows the flag and nothing else about the target page. No core page named Dashboard exists (`DEC-49`, `README.md` in this folder, "Cross-section calls made in the drafting round", Landing route row).

R-31. Collapse state of a category in the sidebar must persist per device in browser storage, not per account (`../design/shell/spec.md`, "Cross-cutting behaviors", `../architecture/module-contract.md`, Navigation row).

R-32. The user menu must sit in the sidebar footer in both chromes and carry Account, Change password, the chrome switch, Help and support from the branding support link, and Sign out. Change password shows on a local-account deployment only, and it is a link out to the realm's own account page in a new tab. It is never a password form inside Genie Ops Center, because Genie Ops Center is not a password store for members (`DEC-10`, `../design/shell/spec.md`, "User Menu"). The chrome switch must render only for a person holding a core admin permission (`DEC-23`, `../design/shell/spec.md`, "User Menu").

R-33. The shell must handle the idle timeout. Section 2 owns the per-request check against `tenant_settings.session_idle_minutes`, the throttled slide, and it exposes the session's idle expiry time to the client. Section 3 schedules the warning from that value, so "Stay signed in" always lands inside the window (`README.md` in this folder, "Cross-section calls made in the drafting round", Idle-timeout seam row). Pointer, keyboard, and touch activity extends the server session silently, throttled to half the idle window. The idle minutes are read through the settings reader on every request, never from a value baked into the auth instance (`DEC-46`, `../core/roadmap.md`, Section 2 item 4). The dialog is the one specified in `../design/sections/account-and-inbox/spec.md`, "UI Requirements": title, a mono countdown in a `role="timer"` region, "Stay signed in" and "Sign out now", focus trapped, Escape inert. At zero the person is signed out and lands on the sign-in page with the expired banner.

R-34. The shell must render an empty state when a person has no grants. The copy and the support contact are those of `../design/sections/account-and-inbox/spec.md`, "UI Requirements", Solutions hub empty state, with the support contact shown only when branding provides one.

R-35. The shell must show an offline indicator on the browser `offline` event: a full-width bar fixed at the top of the viewport above the sidebar and the content, pushing everything below it down, with `role="status"` and `aria-live="polite"`, removed on `online`. It must never render as a column beside the sidebar (`../design/shell/spec.md`, "Cross-cutting behaviors").

R-36. The shell must expose a focus-mode slot that hides the sidebar and the header and gives a page the full width, with an exit control the page renders in its own header. Below 768 pixels a page is always full width (`../design/shell/spec.md`, "Cross-cutting behaviors" and "Design Notes"). The first consumer is the solutions viewer in Section 4.

R-37. The shell must expose a bottom-bar slot for a page's primary action below 768 pixels, and move header actions into it when a page gives no bottom bar (`../design/shell/spec.md`, "Design Notes", `DEC-25`).

R-38. Below 768 pixels the shell must show no sidebar. The header carries the tenant mark, the page title, and the drawer control. The drawer is full height, capped at 84 percent of the viewport width, opens over a dimmed scrim, and closes on scrim tap and on route change (`../design/shell/spec.md`, "Responsive Behavior").

R-39. The shell must read branding for the tenant identity block, the logo or letter tile, the company name, the product name, and the footer links, through the branding reader on the tenant context (`DEC-34`, `DEC-46`).

R-40. The shell must show no notification surface until the inbox screen is scheduled. The Inbox navigation entry and its unread pill stay hidden (`DEC-21`, `../design/shell/spec.md`, "Navigation Structure"). No bell exists in either header.

R-41. Every user-facing string in the shell and in every screen of this section must go through the `next-intl` message catalog installed in Section 0. No string is written inline (`DEC-13`, `../core/roadmap.md`, Section 0 item 9).

R-42. The standard security headers set once in the app extend to the workspace shell. Ordinary shell documents retain the exact Section 0 minimal CSP, including `frame-src 'none'`, without nonce wiring; they invoke no frame-origin provider and make no frame-origin-record query. Rendering the shell around an iframe viewer does not create a second policy path: only the server-owned iframe-viewer document route invokes its owning module's provider under Section 0 R-49/R-49a. Shell links entering such a viewer use full document navigation so that its origin policy is installed before the iframe renders. Prefetch/RSC and other background navigation requests invoke no provider. Prove these rules using the Section 0 placeholder viewer fixture, without depending on Section 4 solutions (`../core/roadmap.md`, Section 0 item 11 and Section 3 item 4; `../architecture/module-contract.md`, Content security policy provider; `DEC-31`).

### Branding pages (item 5)

R-43. The admin portal must carry a Branding page behind `core:branding:manage` with the seven tabs of `../core/roadmap.md`, Section 3 item 5: Identity, Colors and theme, Typography, Sign-in page, Email, Links, Locale. Every tab edits one browser-side draft and shows a live preview of the setting where it lands (`../design/sections/branding/spec.md`, "Overview").

R-44. One Publish must write the whole draft to `tenant_branding` in one transaction and write one `audit_event` row naming the changed fields. Discard drops the draft. Unpublished changes are guarded by the browser's own unload prompt and by no in-app leave dialog (`../design/sections/branding/spec.md`, "User Flows").

R-45. Publish must go through one `applyBranding` step in core, which today writes the branding row only. Nothing from branding is written to the Keycloak realm (`DEC-40`, Guard).

R-46. The Colors and theme tab must check six named contrast pairs and show one pill per pair: Fill light, Fill dark, Text on nav light, Text on nav dark, Count pill, and Focus ring. The four text and fill pairs are checked at 4.5:1 and the focus ring pair is checked at 3:1 against white and against the subtle surface, for WCAG 2.1 success criterion 1.4.11. Publish is blocked while any pair fails, and a failing pill offers a fix that moves lightness first, then saturation, and keeps the hue (`../design/sections/branding/spec.md`, "User Flows" and "UI Requirements", `../design/design-system/tokens.md`, "Focus ring").

R-47. The Colors and theme tab must show no tint strip, because `DEC-47` derives no ramp. It must show the computed foreground swatch and, under the dark pill, the derived value the shell uses on dark surfaces.

R-48. The Typography tab must offer the font from the approved list of R-11, the three font size presets with a sample sentence at the chosen size, and the light-surface text color with two contrast pills at 4.5:1, against white and against the subtle surface, each with the same fix action. Publish is blocked while either fails. The tab must state that the size preset sets the root size and that the text color applies to light surfaces only (`../design/sections/branding/spec.md`, "User Flows").

R-49. Image uploads on the Identity and Sign-in page tabs must go through the core `FileStorage` service in one request, accept the declared types, and respect the deployment limit from `FILE_MAX_BYTES` (`DEC-20`, `DEC-44`, `../architecture/environment-contract.md`, "Files"). An uploaded SVG is sanitized in core before the bytes are stored. The branding row stores the `file.id` in the matching column of `../architecture/data-shape.md`, "Branding". An image is shown to members, in the preview, and in emails only when its `scan_status` is `clean` or `skipped`.

R-50. The Scanning and Infected states must be designed and unreachable in this release. `file.scan_status` stays `skipped` until a scanner exists, and the implementation must not fake a state (`DEC-20`, `../design/sections/branding/spec.md`, "UI Requirements").

R-51. The Email tab must edit sender display name, reply-to, and footer text only. The sender address is the deployment's `MAIL_FROM` and is not editable (`../architecture/environment-contract.md`, "Mail"). The tab must state that for a local-account deployment the sender name and reply-to also apply to the realm SMTP settings, and that the three credential emails are Keycloak's built-in templates carrying the realm display name only (`DEC-40`).

R-52. The Locale tab must offer language, time zone, date format, and number format, and the language select must be disabled while one language is available, with the note the design gives (`DEC-13`, `../design/sections/branding/spec.md`, "UI Requirements"). There is no currency field.

R-53. The Branding page must be designed and built mobile first. Below 768 pixels Discard and Publish move into a sticky bottom bar, the tab strip scrolls with the active tab in view, and the preview collapses behind a toggle (`DEC-25`, `../design/sections/branding/spec.md`, "UI Requirements").

### Sign-in page and email templates (item 6)

R-54. The sign-in page must read branding for the background color or image, the welcome text, the support contact, the system-use notice and its acknowledgement flag, the logo, and the company and product names, through the branding reader. The page itself is Section 2 item 1 work. Section 3 supplies the branding read and the token layer it renders in (`../core/roadmap.md`, Section 3 item 6).

R-55. The React Email templates must read the deployment branding: company name, product name, logo mark, primary color and its stored foreground, font family, sender name, reply-to, footer text, support contact, and the terms and privacy links. The template must read `tenant_branding.primary_foreground` and must never recompute it (`../design/sections/email-templates/types.ts`, `EmailTenant.primaryForeground`).

R-56. Every template must render an HTML part and a plain-text part with the same content in reading order and links written out in full (`../core/roadmap.md`, Section 1 item 8, `../design/sections/email-templates/spec.md`, "UI Requirements").

R-57. Links in an email body must be built from `PUBLIC_URL`. The sender address is `MAIL_FROM` and carries the branding display name (`../architecture/environment-contract.md`, "Required" and "Mail").

R-58. Nothing from branding must be written to the Keycloak realm. The realm display name equals the company name and is set by provisioning. The credential emails of a local-account deployment stay Keycloak's built-in templates (`DEC-40`).

R-59. The template set must be the six Genie templates of `../design/sections/email-templates/spec.md`, "Overview", matching the catalogue of `../core/roadmap.md`, Section 1 item 8. Section 3 owns their branded rendering. Section 2 item 8 owns the events that send them.

### Personal overrides (item 7)

R-60. The account page must carry a Preferences block with language, time zone, and theme. Each control saves on change to `user_preference`, confirms with a toast, and offers a reset to the tenant default. The language control is hidden while one language is available (`../core/roadmap.md`, Section 3 item 7, `../architecture/data-shape.md`, "Branding", `../design/sections/account-and-inbox/spec.md`, "UI Requirements").

R-61. The shell must resolve locale and theme from `user_preference` first and from `tenant_branding` second. A null column means the tenant default (`../architecture/data-shape.md`, `user_preference`).

R-62. The break-glass account page variant must show no Preferences block and no roles block (`DEC-24`, `../design/sections/account-and-inbox/spec.md`, "UI Requirements").

### Design review (item 8)

R-63. Each design round that serves this section must be reviewed against the section before its screens are built, and the review must be recorded under `../design/history/` as `../design/README.md` describes. The rounds are `design-system/tokens.md`, `shell`, `sections/branding`, `sections/email-templates`, the Section 3 parts of `sections/account-and-inbox`, and the Section 3 parts of `sections/audit-and-tenant-settings`.

R-64. Where a design file and a platform document disagree, the platform document wins and the disagreement is reported. Where a reference component and `../design/design-system/tokens.md` disagree, the token file wins. The reference components are not built on (`../design/reference/README.md`, rules 1 and 4).

### Accessibility (item 9)

R-65. WCAG 2.1 AA is the target for every screen in this and later sections (`DEC-21`).

R-66. Every end-to-end screen must be scanned with axe-core through Playwright with the WCAG 2.0 A, WCAG 2.0 AA, WCAG 2.1 A, and WCAG 2.1 AA tag set, and a violation must fail the test (`DEC-21`, `../core/tech-stack.md`, "Quality").

R-67. Focus order must follow reading order on every screen. A clickable table row keeps its own buttons after the row in the tab order (`../design/design-system/tokens.md`, "Tables and card lists").

R-68. An input border must hold 3:1 against its surface, because the border is the boundary of a component. Decorative hairlines are exempt (`../design/design-system/tokens.md`, "Forms and feedback", WCAG 2.1 success criterion 1.4.11).

R-69. The offline bar, toasts, spinners, and inline errors must announce through a live region or a role, and the idle countdown must update inside a `role="timer"` region (`../design/design-system/tokens.md`, "Live regions").

R-70. Reduced motion must be proven, not assumed. One end-to-end test runs with the reduced-motion preference set and asserts that no transition or animation runs (R-7).

R-71. Each design round must also have a manual accessibility review recorded with its design review of R-63 (`DEC-21`).

### Tenant Settings (item 10)

R-72. Tenant Settings requires `core:settings:manage` and uses Navigator A: section navigation plus one selected detail form, with phone list/detail navigation. Core sections cover Onboarding, Local accounts and Sessions using the existing `tenant_settings` fields. Forms are not stacked for every module. Section links and search results open the corresponding section/field; warn before navigation discards dirty edits. Source: `../architecture/module-contract.md`, Settings discovery and authorization (accepted 2026-09-19).

R-73. The idle timeout field must accept 5 to 480 minutes with a default of 15, and the card must state that the change applies to new sessions and to existing sessions on their next activity (`DEC-46`, `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows"). The application enforces this setting per request. It is independent of the realm's own single sign-on idle and maximum lifetimes, which are fixed template values, so changing it here writes nothing to Keycloak (`DEC-46`, `README.md` in this folder, "Cross-section calls made in the drafting round", Realm session settings row).

R-74. The Local accounts switch must be disabled when `tenant_settings.realm_supports_local_accounts` is false, with the note the design gives. That column is written once by the realm step of `genie-ops setup` from the template variant it applied, and this page never reads the realm for it (`../architecture/data-shape.md`, `tenant_settings`; `DEC-36` as amended 2026-09-18; `../design/sections/audit-and-tenant-settings/types.ts`, `TenantRealm`).

R-75. Each compiled module with a `configSchema` contributes a Settings section in module order, including disabled modules through the authorized core pre-enable configuration path. Absent/excluded modules and modules without schemas contribute nothing. Render the selected form with `ConfigForm` in `packages/ui`, using the declared zod schema converted with `z.toJSONSchema()`, TanStack Form and Base UI (`DEC-28`). Saving does not enable the module or clear reintroduction review.

R-75a. Fuzzy search indexes only authorized section/field titles, descriptions and keywords, never saved values or secrets. Results identify and open the section/field with focus. Empty/no-match states and stale links are explicit. Filter unauthorized metadata server-side; do not deliver a hidden full index to the browser. Direct links, reads and saves require `core:settings:manage` AND any additional section permission. A module admin key alone is insufficient. Source: the canonical Settings discovery and authorization boundary.

R-76. `ConfigForm` must support exactly five field kinds: string, number, boolean as a switch, enum as a select, and string list. It must carry title, description, and the constraints the schema declares: minimum, maximum, pattern, maximum length, and item limit. It must never grow into a form engine. A module whose schema uses any other shape fails its contract test at build time (`DEC-28`, `../architecture/module-contract.md`, Configuration schema row).

R-77. The save procedure must validate with the same zod schema the module declared, passed to the form as a Standard Schema validator with no adapter package, and must write to `tenant_module.config` (`DEC-28`, `../core/tech-stack.md`, "Web application", Forms row).

R-78. The placeholder module must declare a `configSchema` that exercises all five field kinds, and the Tenant settings page must show it in development and in test. The placeholder module is never compiled into a customer image (`DEC-28`, `README.md` in this folder, "Terminology").

R-79. Each section saves independently with one audit event and the shared toast. Explicit Discard resets that section; leaving it with unsaved edits requires confirmation. Validation or server refusal preserves edits and supplies an actionable error. Saving module configuration never enables the module. Source: R-72/R-75 and the canonical Settings discovery and authorization boundary.

R-80. Validation messages must be one per field kind as `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows", fixes them. A stored value that fails the schema shows its message on load. Other fields show theirs on blur. Save is disabled while any field is invalid.

### Modules and Categories (item 11)

R-81. The admin portal must carry a Modules page behind `core:settings:manage` listing every module compiled into the image, enabled or not, in image order (`DEC-50`).

R-82. The enabled switch must write `tenant_module.enabled` through one core procedure, and `genie-ops module enable|disable` must call the same procedure. No second writer exists (`DEC-50`, Guard, `README.md` in this folder, "Section boundaries", `genie-ops` row). That procedure is also what appends the module admin key `<id>:admin` to `Tenant administrator` on enable and removes it on disable (`DEC-23`, `README.md` in this folder, "Cross-section calls made in the drafting round", Module admin key row).

R-83. Switching a module off must open the shared confirm dialog in the danger tone with Cancel focused. Switching one on saves at once (`../design/sections/audit-and-tenant-settings/spec.md`, "User Flows"). The confirm copy and the audit wording are the design's choice and stand (`DEC-50`, "Left to the design").

R-84. The category picker must write `tenant_module.category_id` and must show for every module with at least one static workspace entry, which includes the solutions module whose static entry is its hub. A module with no static workspace entry shows no picker (`DEC-50`, `DEC-49`, `../design/sections/audit-and-tenant-settings/types.ts`, `CompiledModule.categoryId`).

R-84a. A newly introduced module on an existing deployment appears disabled pending administrator configuration and explicit enablement (DEC-50 addendum; Section 1 R-27/R-68a). Provide an authorized core configuration path before enabling, even while module-owned screens remain unavailable. Validate declared required values through the shared enable procedure and show actionable errors without switching the module on. Saving configuration is not activation. This extends the configuration-card visibility requirement for compiled, disabled modules needing setup; the design handoff must include this state. Existing module settings and access assignments are preserved.

R-85. The Access column must read holders from `role_assignment`: the groups and people holding a role that carries the module's `<id>:use` key, with a link to the Roles screen. Nothing on the Modules page assigns a role, because a second writer of `role_assignment` is what `DEC-39` forbids (`DEC-50`).

R-86. Whether a switched-off module still lists its holders is the design's choice and stands: they are kept, muted, with an off pill (`DEC-50`, "Left to the design").

R-86a. The Section 3 core migration must create `category` and `user_preference`, and must add the foreign key from `tenant_module.category_id` to `category.id`. The column stays nullable and the constraint is declared on delete set null, so deleting a category leaves its modules ungrouped and the delete of R-89 needs no application-side sweep (`DEC-51`, `../architecture/data-shape.md`, "Navigation" and "Deployment tables", `README.md` in this folder, "Section boundaries", Deployment tables row). Section 1 item 1 created `tenant_module.category_id` without that foreign key, so this is an expand migration and carries no drop (`DEC-43`).

R-87. The admin portal must carry a Categories page behind `core:settings:manage` that creates, renames, reorders, and deletes rows of the core `category` table. Reorder works by drag and by up and down controls, so it is reachable by keyboard and on a phone (`DEC-51`, `DEC-25`).

R-88. The member count on the Categories page must come from `tenant_module.category_id` only. There is no solutions count, because `solution_category` is a module table that core does not read (`DEC-51`). A fixed row at the bottom carries the count of ungrouped modules.

R-89. Deleting a category must leave its members ungrouped and must touch no module table. The confirm dialog names the module count and says that solutions in the category lose their heading, without a number (`DEC-51`, `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows").

R-90. Every change on the Modules page and the Categories page must write one `audit_event` row and show the shared toast (`DEC-50`, `DEC-51`).

R-91. A category id that no longer exists must be treated as no category by every reader, in the shell tree and in a module (`DEC-51`).

R-91a. The same Categories page must offer Assign items for both whole modules with static workspace entries and contributed records, including solutions, using the searchable transfer-list pattern. Core writes whole-module placement; module providers list and change authorized records under the Category assignment boundary in `../architecture/module-contract.md`. Require the page's core permission plus the provider's record-management permission. Recheck at write time; report each row's outcome and allow retry without claiming batch atomicity. Disabled modules retain record placement but expose no editable record rows; excluded modules contribute nothing. Whole-module placement remains available when disabled. Category assignment never changes access grants. R-88's summary counts remain module-only, not combined totals.

### Cross-cutting

R-92. Every screen in this section must be designed and built mobile first, with the phone layout as the base. Tables become card lists and side inspectors become full-height sheets on small screens. No action is desktop-only (`DEC-25`).

R-93. A screen the person may not open must be hidden from navigation, and its route must refuse on the server. The route is not unmounted, and no screen renders a denied state of its own (`DEC-39`, `README.md` in this folder, "Cross-section calls made in the drafting round", Permission-gated route row, `../design/sections/audit-and-tenant-settings/types.ts`, `AuditAndTenantSettingsProps`). The refusal is the one `can()` seam, answered by the per-request loader of `DEC-48`.

R-94. Server state on every screen of this section must live in TanStack Query through tRPC, complex client state in zustand, and trivial local state in `useState` (`../core/tech-stack.md`, "Web application"). The Branding draft is complex client state.

R-95. No screen in this section may check a permission outside `can()` or filter a list outside `scopesFor()` (`DEC-39`). The shell renders navigation from `can()` answered by the one per-request loader, so a tree of a dozen entries costs one assignment read (`DEC-48`).

R-84b. Support [CF-MA-10–11](../flows/module-access-upgrades.md) through core administration under the [removal policy](../architecture/module-removal.md). Historical grants display “Unavailable — module not installed” without requiring the missing module's code. A reintroduced module remains disabled and presents retained configuration and grants for administrator review, including removal of unwanted assignments, before explicit enable confirmation explaining restored access. No reinstated credentials or automatic work resumption is implied. Align the design handoff before implementation; this requirement does not claim existing designs comply.

## Acceptance criteria

One criterion per roadmap work item, then one per clause of the definition of done.

AC-1 (item 1, proves R-1 to R-11). `packages/ui` exports the token layer. A unit test asserts the six type roles, the three control heights, the radius values, and the motion duration band against `../design/design-system/tokens.md`. The repository check of R-4 fails a branch that introduces an arbitrary pixel text size and passes on the clean tree. A build test asserts that no font URL outside the image appears in any emitted stylesheet.

AC-2 (item 2, proves R-12 to R-18). An integration test builds two tenant contexts against two databases with different `tenant_branding` rows and renders the shell through each. Each response carries its own `--primary` and `--primary-foreground`, its own root font size, and its own `--foreground`, and no other color variable is emitted. A second assertion proves no tint ramp variable exists. An end-to-end test changes the primary color, waits past the 10 second reader window, reloads, and sees the new value.

AC-3 (item 3, proves R-19 to R-26). Vitest browser-mode component tests cover Button, Input, Select, Dialog, Table, Toast, Switch, and Tabs: each renders at the default height, takes the focus ring constant, and exposes its role. Table renders as a card list below 768 pixels. Dialog is 480 pixels on desktop and full width with a bottom action bar on a phone viewport. An import test proves `packages/ui` pulls in nothing internal.

AC-4 (item 4, proves R-27 to R-42). An end-to-end test signs in and lands on the entry marked the landing route. A registry unit test fails a build in which two entries carry the flag, and a second end-to-end run with the landing module disabled opens the no-grants empty state instead. A module whose category is set on the Modules page moves its static entry from the workspace block under that heading, and its landing-route flag survives the move. The workspace sidebar shows only entitled modules the person may reach, grouped by core categories, with entries of a deleted category in the ungrouped area. A person with no grants sees the empty state. The account menu shows the chrome switch only for a person with a core admin permission. Collapsing a category and reloading keeps it collapsed on the same device and not on another. The offline event shows the full-width bar above the sidebar. The drawer opens below 768 pixels and closes on route change. The idle dialog appears before server expiry and "Stay signed in" keeps the session. A header assertion proves the content security policy and the other headers of `DEC-31` are present on a shell route.

AC-4a (shell CSP scope, proves R-42). Extend AC-4's header check with provider-call instrumentation and exact minimal-policy assertions (no default/script/style directives or nonce sources). Verify branding styles, pre-hydration theme initialization and hydration without nonce wiring: ordinary shell documents retain the standard headers and `frame-src 'none'`, with zero frame-origin provider calls or origin-record queries, including prefetch/RSC requests. Following a shell link to the placeholder iframe-viewer fixture performs a full document navigation, invokes only its owning provider, installs the viewer policy, and visibly loads locally controlled permitted frame content. The fixture's load event alone is not proof. Section 4 repeats this with its real viewer and adds chat/stream zero-call checks; the Section 0 non-viewer response coverage remains in force.

AC-5 (item 5, proves R-43 to R-53). An end-to-end test opens Branding, edits a field on each of the seven tabs, sees the preview change and the unpublished indicator count rise, presses Publish, confirms, and finds one `audit_event` row naming the changed fields and one updated `tenant_branding` row. A color that fails any of the six named pairs blocks Publish and offers a fix that passes. A text color that fails either typography pair blocks Publish. A logo upload stores a `file` row and shows the image. No Keycloak admin call is made during the publish.

AC-6 (item 6, proves R-54 to R-59). An end-to-end test publishes a branding change and then asserts the new company name, logo, and primary color on the sign-in page and in a rendered email. A unit test renders each of the six templates against two branding fixtures and asserts that every color, name, link, and footer follows branding with no template change, that the plain-text part carries the same content in reading order, and that the stored `primary_foreground` is used unchanged.

AC-7 (item 7, proves R-60 to R-62). An end-to-end test sets a theme and a time zone on the account page, reloads, and sees the shell honour them. Resetting one control to the tenant default clears the column in `user_preference` and the shell falls back to `tenant_branding`. The break-glass account page variant shows no Preferences block.

AC-8 (item 8, proves R-63 and R-64). Each design round that serves this section has a dated review record under `../design/history/` naming the section, the reviewer, the findings, and their resolution, before its screens are built.

AC-9 (item 9, proves R-65 to R-71). The axe scan of R-66 runs on every end-to-end screen of this section at a phone viewport and a desktop viewport and reports no violation. A keyboard test walks the shell, the Branding page, and the Tenant settings page in reading order. The reduced-motion test of R-70 passes. A manual review record exists per design round.

AC-10 (item 10, proves R-72 to R-80). An end-to-end test signed in as a tenant administrator changes onboarding mode, local accounts, and idle minutes, and each save writes one `audit_event` row. The placeholder module's configuration section renders all five field kinds, refuses an invalid value with the fixed message, and saves valid values into `tenant_module.config`. A module that declares no `configSchema` shows no section. A contract test proves a module schema using a sixth shape fails at build time. A person without `core:settings:manage` sees no navigation item, and the procedure refuses a direct call.

AC-11a (item 11 migration, proves R-86a). An integration test against a Testcontainers Postgres applies the core history and asserts that `category` and `user_preference` exist, that `tenant_module.category_id` carries a nullable foreign key to `category.id` declared on delete set null, and that deleting a category row sets the column to null on every module that named it, with no other row touched. A second assertion proves the migration upgrades a database that already holds Section 1 and Section 2 rows, so the release upgrades from the last three (`DEC-43`).

AC-11 (item 11, proves R-81 to R-91). An end-to-end test lists every compiled module, switches one off through the confirm dialog, and proves that its navigation entry disappears and its routes refuse. A second test runs `genie-ops module disable` for the same module and proves the same procedure wrote the same row. A category is created, renamed, reordered, assigned to a module, and deleted, and the module falls into the ungrouped area with no module table touched. The Categories count matches `tenant_module.category_id` alone. Access lists the holders read from `role_assignment` and links to Roles, and no role is assignable from the page. Every change leaves one `audit_event` row.

AC-12 (done-when, a branding change shows on the sign-in page, proves R-12, R-54). The end-to-end branding test of AC-6 asserts the published company name, logo, welcome text, and primary color on the sign-in page.

AC-13 (done-when, a branding change shows on the shell, proves R-12, R-39). The same test signs in and asserts the published logo, company name, and primary accent in the shell.

AC-14 (done-when, a branding change shows on an email, proves R-55, R-56). The same test triggers one template, captures the rendered email, and asserts the published mark, primary color, sender name, and footer text in both parts.

AC-15 (done-when, light and dark themes, proves R-14, R-15, R-17). AC-12 to AC-14 each run once with the tenant default theme light and once dark. The email stays light in both runs, as `../design/sections/email-templates/spec.md`, "UI Requirements", fixes.

AC-16 (done-when, focus order, proves R-8, R-67). A keyboard walk of the shell, Branding, Tenant settings, Modules, and Categories reaches every interactive element in reading order, and each shows the shared focus ring.

AC-17 (done-when, contrast, proves R-9, R-46, R-48, R-68). The axe scan reports no contrast violation on any screen of this section, in both themes, and the six named branding pairs and the two typography pairs are proven by unit tests over the contrast function with passing and failing fixtures.

AC-18 (done-when, reduced motion, proves R-7, R-70). The reduced-motion end-to-end run shows no transition and no animation on the shell, the drawer, the dialog, and the toast.

AC-14a (module return). Documented stories and interaction tests cover missing-module, reintroduced-disabled, retained-grant review, invalid configuration and enable-confirmation states. Phone and desktop E2E prove review/removal/enable using the shared server checks and real denial/restoration. Missing module routes are never linked as reachable. Proves R-84b and CF-MA-10–11; component tests alone are insufficient.

AC-19 (accepted Categories/Settings decisions, proves R-72/R-75/R-75a/R-79/R-91a). Unit/contract tests cover metadata-only fuzzy matches, stable link resolution and additional-permission AND semantics. Integration tests prove baseline-only, baseline-plus-required-key, module-key-only and no-key cases on reads/search/writes; unauthorized metadata and configured values never enter the search response. A disabled compiled module can save valid configuration without enabling or completing reintroduction; an excluded module has no section/provider. Using the Section 0 synthetic contribution, prove authorized category assignment/clear, denied and cross-tenant refusal, per-row failure/retry, module-owned audit and no core module-table access. Phone/desktop stories and E2E prove the single Categories transfer list mixes whole modules and contributed records, then navigator search, focus, no-match/stale links, independent saves and dirty-navigation recovery. Section 4 repeats category proof with real solutions. See `../flows/categories-and-settings.md`.

## Verification

Landing-route tests in this section use test-only navigation fixtures for a reachable flagged entry, no flagged entry, and a disabled or inaccessible flagged entry. They must not require the Section 4 solutions implementation or add a flag to the shipped placeholder. Section 4 repeats the successful landing path with the real solutions entry.

Unit, Vitest. The contrast function and its fix suggestion, with fixtures that pass and fail each of the six named pairs and the two typography pairs. The token constants against `../design/design-system/tokens.md`. The navigation tree builder: entries with a category, entries without one, an entry whose category id no longer exists, the six-entry pinned cap, and the landing-route flag. The `z.toJSONSchema()` conversion into the five `ConfigForm` field kinds, and the refusal of a sixth shape. The six email templates against two branding fixtures, HTML and plain text.

Component, Storybook Vitest addon in browser mode using the Section 0 harness. Each primitive of R-19, the `ConfigForm` field kinds, the confirm dialog focus rule, the toast stack, and the idle dialog countdown region have colocated documented stories and applicable interaction/accessibility tests following `../architecture/ui-development.md`. AC-3 is proved through this layer, including phone/desktop states and shared theme tokens. Core feature stories live with core; the host composes them without UI-to-core imports. The section delivers the full primitive catalogue; Section 0 does not preimplement it. Component tests supplement the real integration and E2E requirements below.

Integration, Vitest with Testcontainers against a real Postgres with the real migration histories. The branding publish transaction and its audit row. The settings save and its audit row. The module enable procedure called from the page path and from the command path, proving one writer. The Section 3 migration of R-86a on a database that already holds Section 1 and Section 2 rows, asserting the two new tables and the on delete set null foreign key. The category create, rename, reorder, and delete, proving no module table is touched and the count comes from `tenant_module.category_id`. The `user_preference` write and the shell resolution order. The two-context isolation test of `DEC-34` extended with the branding reader, proving each context emits its own token layer.

End-to-end, Playwright against one seeded deployment, every test at a phone viewport and a desktop viewport (`DEC-25`). The branding round trip of AC-12 to AC-15. The shell navigation, empty state, drawer, offline bar, and idle dialog. The Tenant settings, Modules, and Categories flows. The axe scan of R-66 on every screen. The reduced-motion run of R-70.

Manual. The accessibility review per design round (`DEC-21`). A screen-reader pass over the shell, the idle dialog, and the Branding contrast pills. A visual check of the two themes against the design captures, with `../design/design-system/tokens.md` as the arbiter where a capture disagrees.

Static. The arbitrary pixel text size check of R-4. The oxlint import direction rules, which must keep `packages/ui` free of internal imports and keep `packages/core` importing `packages/ui` only.

## Deferred

- The inbox screen and the unread pill. Designed in `../design/sections/account-and-inbox/spec.md`. Deferred by `DEC-21` to Section 5 item 8. Reopens when the first module needs the inbox. The shell keeps the entry and the pill hidden rather than removing them.
- A core page named Dashboard and a landing-slot contract point. Refused by `DEC-49`. Reopens when a second widget exists and has requirements. The guard that keeps the path open is the landing-route flag on a navigation entry, which a later Dashboard retargets without touching a module.
- A second tenant brand color. Refused by `DEC-47`. Reopens when a surface needs one, as `secondary_color` with a named surface and its own contrast pair. The guard is that the token layer is emitted from `tenant_branding` alone through one `applyBranding` step.
- A tint ramp derived from the tenant color. Refused by the 2026-09-17 amendment of `DEC-47`. Reopens only with the second color above.
- Branded Keycloak credential emails. Refused by `DEC-40`. Reopens when a local-account customer asks, by the realm localization override path. The guard is the single `applyBranding` step and the realm template keeping `emailTheme` unset rather than absent.
- A sixth `ConfigForm` field kind. Refused by `DEC-28`. Reopens when a real module needs one twice.
- A solutions count on the Categories page. Refused by `DEC-51`. Reopens as a member-count extension point in the module contract that a module answers, never a core read of a module table.
- Per-person module visibility set from the Modules page. Refused by `DEC-50`. Reopens as an assign control that calls the roles procedure, never a new table.
- A seventh core permission key for the Modules page. Refused by `DEC-50`. Reopens with the separation-of-duties revisit of `DEC-23`.
- The solutions navigation entries, the pinned rail contents, and the solutions hub. Section 4 item 1 supplies them through the same contract.
- Instant propagation of a branding or settings change. `DEC-46` sets 10 seconds. Reopens as a `pg_notify` channel when a customer needs a change within a second or a deployment runs several replicas.
- Translations. `DEC-13` keeps one English catalog. Reopens when a customer contract names a second language.
- Font upload, custom CSS, per-realm Keycloak page theming, crop and resize tools, and a CSS token export. Out of scope in `../design/sections/branding/spec.md`, "UI Requirements".

Assumptions

- Documentation checked with Context7 on 2026-09-18, and the claims below rest on it. Base UI ships as `@base-ui/react` and the old `@base-ui-components/react` scope is replaced, which matches `../core/tech-stack.md`, "Web application". Select, Dialog, Switch, Tabs, and Field are present with the anatomies the primitives need. If the package name moves again the primitives change their import and nothing else.
- Tailwind 4 carries a runtime value into a utility through a theme variable declared with `@theme inline` over a CSS custom property set on the document root. This is the mechanism R-12 and R-13 rely on. Verified against the Tailwind documentation. If the directive changes, the token layer changes in one file in `packages/config` and `packages/ui`.
- R-16/R-17 retain request-bound branding and the pre-hydration theme behavior. The accepted minimal CSP does not require nonce-bearing style elements or scripts. Verify branding styles, theme initialization and hydration in the built app; removing nonces does not relax tenant-isolated rendering or caching.
- next-intl supports an App Router setup with no locale routing by returning a locale from `getRequestConfig` and rendering `NextIntlClientProvider` in the root layout. Verified. This is what `DEC-13` needs, since Genie Ops Center has one public URL per deployment and no locale segment.
- React Email renders an HTML string and a plain-text alternative from the same component tree. Verified. R-56 depends on it.
- axe-core exposes `withTags` and `analyze` through the Playwright integration, and the WCAG 2.1 AA tag set is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Verified against the axe-core documentation. The Playwright package version itself was not pinned in this review.
- TanStack Form accepts a zod schema directly in its validators through Standard Schema, with no adapter package, and a Standard Schema validator changes the error map shape to a record keyed by field. Verified. R-77 and R-80 depend on it.
- zod 4 exposes `z.toJSONSchema(schema, options)` and throws on an unrepresentable type unless configured otherwise. Verified. R-75 depends on it, and the five-kind restriction of `DEC-28` keeps every module schema representable, so the contract test of R-76 can assert a clean conversion.
- Not verified in this round: the exact `@axe-core/playwright` release, the shadcn command line's current support for a Base UI registry, and the Vitest browser-mode provider. Each is a Section 0 tooling choice rather than a Section 3 behavior.
- No contradiction with `../core/tech-stack.md` was found in the checks above. Every verified fact matches what that file already states.
- The three drifts this draft first reported are fixed in their own documents and are no longer open. `../core/roadmap.md`, "Order and parallelism", now names item 11 among the dependent items. `../core/roadmap.md`, Section 3 item 4, now says the security headers of Section 0 item 11 are asserted on the workspace shell. `../design/design-system/tokens.md`, "Type scale", now names Plus Jakarta Sans as the default of the tenant font family key rather than as a fixed family.
- `BrandingImage.width` and `BrandingImage.height` in `../design/sections/branding/types.ts` are read from the stored bytes at read time. No column is added to `file`, which keeps that table free of image-specific columns (`../architecture/data-shape.md`, "Files"). If reading at request time proves costly, the fix is two nullable columns and nothing else changes.
- The Branding audit action key is assumed to be one key naming a branding publish, and the Tenant settings, Modules, and Categories keys are assumed to follow the same `core:<thing>:<verb>` shape as the keys already listed in `../architecture/data-shape.md`, "Audit". No document fixes the exact strings. If they are fixed later, the audit helper changes in one place.
- The design's email gallery is a design artifact and a development preview through the React Email preview tool, not a shipped admin screen. `../core/roadmap.md`, Section 3 item 6, asks only that the templates read branding. Decided by the product owner on 2026-09-18 and recorded at the top of `../design/sections/email-templates/spec.md`.
- The reference components under `../design/reference/` are read for intent only and are not ported. Their imports do not resolve and their class names are a sketch (`../design/reference/README.md`, rules 2 and 4).
- The branding preview renders the draft in the browser from the same components the shell and the email use, so no server round trip is needed per keystroke. The design shows a preview, not a mechanism.
- Item 6 runs beside Section 2 in the roadmap order, but the sign-in page itself is a Section 2 screen. The assumption is that Section 3 delivers the branding read and the templates during that window and that the sign-in page picks the read up when Section 2 builds it. If the two sections land out of step, item 6 slips behind Section 2 item 1 and nothing else changes.

Open questions

- Decided by the product owner on 2026-09-18 and no longer open: the email gallery is a development preview only.
- Decided by the product owner on 2026-09-18 and no longer open: the realm's local-account capability is `tenant_settings.realm_supports_local_accounts`, written by the realm step of `genie-ops setup` (R-74, `DEC-36` amended).
- Finding, `AccountUser.identitySource`, `AccountUser.lastSyncedAt`, and `TenantSupport.grantedBy`. `../design/sections/account-and-inbox/types.ts` declares all three and no column in `../architecture/data-shape.md` holds them. All three belong to the Section 2 account page, not to the Preferences block this section adds. The coordinator must reconcile them with Section 2. They do not block item 7.
