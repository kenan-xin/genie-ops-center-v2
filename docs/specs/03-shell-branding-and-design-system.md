Confidence: 8.1/10

Business scenario: [CF-MA-01](../flows/module-access-upgrades.md) describes configuring a newly delivered module before explicit activation. R-84a must support this journey; the flow is not evidence that the delivered design already includes the pre-enable state.
Reasoning: Every platform document and every design file that serves this section was read, and each requirement below is traced to a roadmap item, a decision id, a data-shape column, a design heading, or a row of the cross-section call table in `README.md`. The integration pass closed the three document drifts this draft had found and settled the font list, the landing-route fallback, the hub entry placement, the idle-timeout seam, and the optional `configuration.schema`; the decisions of 2026-09-18 settled the email gallery and the realm capability column, so no open question remains. A cross-specification review found that the first draft had carried no migration requirement at all, which is now R-86a, and that finding keeps the score modest. Sections 0 to 2 are built. The readers, `can()`, `scopesFor()`, the idle expiry in `SessionActivity`, `landingRoute`, and `permittedNavigation` exist, and this section extends them. The per-request token layer, the one navigation tree, and the contrast checks are still proven only on paper.
Status: Approved by the product owner for ticket breakdown, 2026-10-19, after the branding cut (three Branding tabs), the organization-only theme, and the OPEN-9 seed decisions of the same day. Revised 2026-10-22 after the critique (owner decisions F-1 to F-26) and after a consistency check (C-1 to C-13). Both are recorded in [Revision of 2026-10-22](#revision-of-2026-10-22). Re-approved by the product owner for ticket breakdown, 2026-10-22, as revised, including `--brand-on-dark` (blue-400), the 1 MB branding image cap, and the contrast pairs on the Branding page (five, with two levels, since the R-46 revision of 2026-10-25).

## Goal and scope

Section 3 delivers the look and the frame of Genie Ops Center: the fixed token layer in `packages/ui`, the tenant token layer emitted per request from `tenant_branding`, the design-system primitives, the one shell in `packages/core` with its two chromes, the Branding pages, the text and color branding read on the sign-in page and in the React Email templates, the accessibility gate, the Tenant Settings page with `ConfigForm`, and the Modules and Categories pages.

In scope, by roadmap item (`../core/roadmap.md`, "Section 3: Shell, branding, and design system"):

1. Fixed token layer.
2. Tenant token layer.
3. Primitives in `packages/ui`, which replace the Section 2 core kit (R-19a).
4. Shell in core.
5. Branding pages.
6. Sign-in page and email templates read branding, as text and color only (R-54).
7. Personal overrides in `user_preference`. Deferred 2026-10-22 (owner, spec 03 critique F-24), see "Deferred".
8. Section designs reviewed one at a time, as part of each ticket's definition of done (R-63).
9. Accessibility.
10. Tenant Settings page.
11. Modules and Categories pages.

Excluded, with the owner named:

- The sign-in page itself, the break-glass sign-in page, the account page frame, the sessions block, and the roles summary. Section 2 items 4, 7, and 11 build them. Section 3 adds the branding read. The Preferences block is deferred (R-60).
- The audit reader screen. Section 2 item 12 builds it. Section 3 writes audit events that it reads.
- `can()`, `scopesFor()`, `role`, `role_assignment`, and the group sync. Section 2 item 6 builds them. Section 3 consumes them.
- The solutions hub, the solutions navigation entries, the pinned rail contents, chat themes, and the Access overview screen of the solutions admin. Section 4 and `../modules/solutions/README.md` own them.
- The Notifications page and the header bell with its unread count. Deferred by `DEC-21` to roadmap Section 6 item 5. The shell shows no bell until then.
- A core page named Dashboard and a landing-slot contract point. Refused by `DEC-49`.
- The `s3` file adapter, malware scanning, CSV export, and SIEM push.
- Per-request record navigation entries, record-level category assignment, and the focus-mode slot. Moved to Section 4 on 2026-10-22 (owner, spec 03 critique F-6, F-22, F-26).
- The review screens for a module that was removed and brought back. Moved to Section 5 on 2026-10-22 (owner, spec 03 critique F-23).

Order inside the section (`../core/roadmap.md`, "Order and parallelism", which now names item 11 among the dependent items). Section 3 starts when Section 1 is done. Items 1, 2, 3, 6, 8, and 9 run beside Section 2. Items 4, 5, 10, and 11 need the access seam of Section 2 item 6 and the account page of Section 2 item 4, and follow them. Both now exist. The first ticket is the app build fix of R-19c (bead `crg7`). The first primitives ticket is the spike of R-19b.

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

Revised 2026-10-22 (owner, spec 03 critique F-4). The color roles are the shadcn variables that the Section 2 screens already use: `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`, `--primary-foreground`, and `--destructive`. The fixed layer adds one more variable, `--brand-on-dark` (R-15). The app stylesheet maps each one in `@theme inline` to a Tailwind color of the same name, for example `--color-primary: var(--primary)`. That mapping is what makes `bg-primary`, `ring-ring`, `border-input`, and `text-muted-foreground` resolve. Only `--primary`, `--primary-foreground`, and `--sign-in-background` are filled per tenant (R-13). The fixed layer gives every other variable its light and dark value, as `../design/design-system/tokens.md`, "Color roles", lists them.

R-2. The type scale must be the six roles of `../design/design-system/tokens.md`, "Type scale": display, title, heading, body, secondary, caption, each bound to one Tailwind text utility and one weight. Display and title step down one size below the `lg` breakpoint.

R-3. Every text size must be rem-based so that the tenant root font size moves the whole scale with no per-component change (`DEC-47`, `../design/design-system/tokens.md`, "Type scale").

R-4. An arbitrary pixel text size must not appear in any package. A repository check must fail the build when a source file matches an arbitrary pixel text utility. The check is the one named in `../design/design-system/tokens.md`, "Type scale", run over `packages/ui`, `packages/core`, `packages/modules/*`, `apps/*`, and `customers/*/app/`, and it must run in the pull request pipeline beside lint.

R-5. Control heights must be one scale: 32 px, 40 px, and 44 px, with 40 px the default and no other height class on a control. The heights are fixed pixels at every font size preset, so a touch target keeps its size when a tenant picks the compact preset (`../design/design-system/tokens.md`, "Control heights", which resolves the trade-off `DEC-47` left to the design). Below the `lg` breakpoint every interactive row and icon button is at least 44 px tall (`../design/shell/spec.md`, "Cross-cutting behaviors").

R-6. Radius, spacing, and elevation must follow `../design/design-system/tokens.md`, "Radius, spacing, elevation, motion". Borders carry separation. Only dialogs, sheets, and menus carry a shadow.

R-7. Every `transition-*` and `animate-*` utility must be written under `motion-safe:`, or paired with a `motion-reduce:` reset. Motion lasts 150 to 220 milliseconds with an ease-out curve, with no bounce and no scale, and collapses to no motion under `prefers-reduced-motion` (`../design/design-system/tokens.md`, "Radius, spacing, elevation, motion").

R-8. One exported constant must hold the focus ring class string, and every focusable control must append it. No component writes its own ring classes and no component sets `outline: none` without the ring. Revised 2026-10-22 (owner, spec 03 critique F-9): the constant uses `ring-ring`, and `--ring` maps to `--primary` in the light theme and to the fixed `--brand-on-dark` in the dark theme (R-15). The constant carries no hard-coded color (`../design/design-system/tokens.md`, "Focus ring").

R-9. The color roles must be those of `../design/design-system/tokens.md`, "Color roles". The tenant color fills solid surfaces in both themes. It also colors brand text and the focus ring in the light theme. In the dark theme those two take the fixed `--brand-on-dark` (R-15). Every tinted surface that stands for identity or a label stays a fixed neutral gray, the avatar background and the Admin portal pill included. A tint that carries state or meaning keeps its fixed informational color and is not brand. Hover is the same color at 90 percent opacity and press at 80 percent, never a derived shade (`DEC-47`, amendment of 2026-09-17).

R-10. Every font face must be self-hosted in the image, subset to latin and latin-ext, served with `font-display: swap`, and the one weight the sign-in page paints first must be preloaded. No font is fetched from a third-party font service at run time, on any page, so a regulated customer sees no outbound request from the sign-in page (`../design/design-system/tokens.md`, "Type scale"). Revised 2026-10-22 (owner, spec 03 critique F-25): `packages/ui` ships the `@font-face` rules and the font files through a CSS export that the app stylesheet imports. Only the default face is preloaded. The font family reaches the page through `--font-sans`, which stays the per-request seam for a tenant font key. No font is chosen at build time with `next/font`.

R-11. The approved font list must be a constant in `packages/ui`. Revised 2026-10-22 (owner, spec 03 critique F-25): until the Typography tab reopens, the list holds one key, `plus-jakarta-sans`, and the image ships only that face and the fixed mono face. The keys `ibm-plex-sans`, `manrope`, and `source-serif-4` of `../architecture/data-shape.md`, "Branding", return with the Typography tab (see "Deferred"). The list grows only by a pull request that adds the font files, so a key the list holds always renders (`README.md` in this folder, "Cross-section calls made in the drafting round", Fonts row). The mono face is fixed and is not a tenant choice. The same constant is what the solutions module's chat themes read for their font field (`../modules/solutions/README.md`, `chat_theme`).

### Tenant token layer (item 2)

R-12. The application must emit the tenant token layer as CSS custom properties per request, from `tenant_branding` read through the branding reader on the tenant context, and from nowhere else (`../core/roadmap.md`, Section 3 item 2, `DEC-34`, `DEC-46`).

R-12a. Added 2026-10-22 (owner, spec 03 critique F-5). When no `tenant_branding` row exists, the application must emit the fixed defaults from `packages/ui` and must not call the branding reader. The not-set-up page of a fresh deployment then renders without an error.

R-13. The emitted color variables must be `--primary`, `--primary-foreground`, and `--sign-in-background` only. `--primary` takes `tenant_branding.primary_color` and `--primary-foreground` takes the stored `tenant_branding.primary_foreground`. No tint ramp is derived, no color-space computation runs in `packages/ui`, and no per-step contrast check exists (`DEC-47`, `../architecture/data-shape.md`, "Branding"). Revised 2026-10-25 (owner, drift finding DR-05): `--sign-in-background` takes `tenant_branding.login_background_color`, or `--background` when none is set. Only the light sign-in page of R-54 reads it, and the fifth pair of R-46 checks it.

R-14. The emitted typography variables must be the root font size from `tenant_branding.font_size` (compact 14 px, default 15 px, large 16 px) and the font family in `--font-sans` (`DEC-47`, `../design/sections/branding/spec.md`, "Design notes"). Revised 2026-10-22 (consistency check C-2): the font family is fixed to the default face of R-11 until the Typography tab reopens (F-25). The light-surface text color from `tenant_branding.text_color` is deferred with the Typography tab. `--foreground` keeps its fixed value in both themes, as R-1 states. See "Deferred".

R-15. Revised 2026-10-22 (owner, spec 03 critique F-2). In the dark theme, brand text and icons and the focus ring use one fixed light color from the fixed token layer, `--brand-on-dark` (blue-400, `#60a5fa`). It is not derived from the tenant color, and no color is computed. A solid brand fill, such as a button or the count pill, keeps `--primary` with the stored `--primary-foreground` in both themes (`../design/design-system/tokens.md`, "Color roles").

R-16. The emitted variables must be carried on the document root in a style element; the minimal CSP does not require a nonce (`../core/roadmap.md`, Section 0 item 11, `DEC-31`). A route that renders the shell or the sign-in page is request-bound because it reads branding, and the implementation must accept that rather than cache the markup across tenants.

R-17. Resolving the theme must not flash the wrong theme before hydration. The resolved theme is written on the document root by the server when it is known, and the client corrects it before paint when the organization's default theme is `system`. A person has no theme preference: theme belongs to the organization (owner decision 2026-10-19). Revised 2026-10-22 (owner, spec 03 critique F-10): the theme is a `data-theme` attribute on `<html>`, and the app stylesheet declares `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`. Every `dark:` class then follows the attribute, not the operating system setting.

R-18. A branding change must show on the next page load in a process whose branding reader cache has expired, within the 10 second window of `DEC-46`. Nothing invalidates the cache on save, and no process restarts.

### Primitives (item 3)

R-19. `packages/ui` must ship Button, Input, Select, Dialog, Table, Toast, Switch, and Tabs, built on shadcn over Base UI (`@base-ui/react`) as `../core/tech-stack.md`, "Web application", fixes the stack. Every primitive reads the token layer and never hard-codes a value the token layer owns.

R-19a. Added 2026-10-22 (owner, spec 03 critique F-8). Item 3 replaces the Section 2 core kit. The shadcn primitives on Base UI are built in `packages/ui`. People, Groups, and Roles switch to them, and so do the other Section 2 screens that import the kit. Then `packages/core/src/features/admin/ui.tsx` is deleted, together with the other local `focusRing` copies in core. A lint check refuses a second `ConfirmDialog` or `focusRing` outside `packages/ui`.

R-19b. Added 2026-10-22 (owner, spec 03 critique F-19). The first primitives ticket is a short spike that sets up shadcn on Base UI in `packages/ui`, with `components.json` and `@base-ui/react`. Its result is recorded in `../core/tech-stack.md` before the other primitives start.

R-19c. Added 2026-10-22 (owner, spec 03 critique F-3). The app build must compile the Tailwind classes used in `packages/ui`, in `packages/core`, and in each module the image includes, as the Storybook build already does (bead `crg7`). This is the first Section 3 ticket.

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

R-29. The tree the shell renders must be the one contract shape, `{ pinned: Entry[], entries: Entry[] }`, with at most six ordered pinned entries. Revised 2026-10-22 (owner, spec 03 critique F-6): Section 3 renders static module entries only. Core groups entries under the `category` rows, places a module's static workspace entries under `tenant_module.category_id`, sorts inside a category by label, and puts entries with no category and entries whose category id no longer exists into one ungrouped area. The category an administrator picks on the Modules page always wins. This section removes `categoryId` from static entries in the module contract and in the placeholder module. Per-request record entries move to Section 4, which adds a per-request navigation hook to the module contract (see "Deferred"). The headings above the tree and the sort order inside a category are the design's choice and stand (`DEC-51`, "Left to the design", `../design/shell/spec.md`, "Navigation Structure").

R-29a. A module's static workspace entry whose `tenant_module.category_id` is null must render in the workspace block above the category tree, and the same entry must render under the category heading once an administrator picks a category on the Modules page. The landing-route flag does not depend on that placement (`DEC-50`, `../design/shell/spec.md`, "Navigation Structure", `README.md` in this folder, "Cross-section calls made in the drafting round", Hub entry placement row).

R-30. The shell must send a person after sign-in to the workspace navigation entry marked the landing route. At most one entry across all compiled modules may carry the flag; zero is valid, and the module registry must fail the build when two do. When no entitled module declares one, or the person cannot reach the one that does, the shell must open its no-grants empty state instead. Core knows the flag and nothing else about the target page. No core page named Dashboard exists (`DEC-49`, `README.md` in this folder, "Cross-section calls made in the drafting round", Landing route row). Revised 2026-10-22 (owner, spec 03 critique F-11): Section 2 already built `landingRoute` (`packages/core/src/lib/entitlement/index.ts`) and `permittedNavigation`, which joins the entitlements and `can()`. The shell extends both and builds no second landing resolver or navigation filter.

R-31. Collapse state of a category in the sidebar must persist per device in browser storage, not per account (`../design/shell/spec.md`, "Cross-cutting behaviors", `../architecture/module-contract.md`, Navigation row).

R-32. The user menu must sit in the sidebar footer in both chromes and carry Account, Change password, the chrome switch, Help and support from the branding support link, and Sign out. Change password shows on a local-account deployment only, and it is a link out to the realm's own account page in a new tab. It is never a password form inside Genie Ops Center, because Genie Ops Center is not a password store for members (`DEC-10`, `../design/shell/spec.md`, "User Menu"). The chrome switch must render only for a person holding a core admin permission (`DEC-23`, `../design/shell/spec.md`, "User Menu").

R-33. The shell must handle the idle timeout. Section 2 owns the per-request check against `tenant_settings.session_idle_minutes` and the throttled slide. Revised 2026-10-22 (owner, spec 03 critique F-11): Section 2 already built `SessionActivity` (`packages/core/src/features/account/session-activity.tsx`), which runs the browser idle count of Spec 02 R-15a and is mounted in the root layout. Section 3 adds the warning dialog inside `SessionActivity` and builds no second timer. The warning opens in every tab two minutes before the count ends, or at half the idle window when that is shorter, and "Stay signed in" restarts the count in every tab (`README.md` in this folder, "Cross-section calls made in the drafting round", Idle-timeout seam row; amended 2026-10-25, code review shell H-1). Pointer, keyboard, and touch activity extends the server session silently, throttled to half the idle window. The idle minutes are read through the settings reader on every request, never from a value baked into the auth instance (`DEC-46`, `../core/roadmap.md`, Section 2 item 4). The dialog is the one specified in `../design/sections/account-and-inbox/spec.md`, "UI Requirements": title, a mono countdown in a `role="timer"` region, "Stay signed in" and "Sign out now", focus trapped, Escape inert. At zero the person is signed out and lands on the sign-in page with the expired banner.

R-34. The shell must render an empty state when a person has no grants. The copy and the support contact are those of `../design/sections/account-and-inbox/spec.md`, "UI Requirements", Solutions hub empty state, with the support contact shown only when branding provides one.

R-35. The shell must show an offline indicator on the browser `offline` event: a full-width bar fixed at the top of the viewport above the sidebar and the content, pushing everything below it down, with `role="status"` and `aria-live="polite"`, removed on `online`. It must never render as a column beside the sidebar (`../design/shell/spec.md`, "Cross-cutting behaviors").

R-36. Moved to Section 4 on 2026-10-22 (owner, spec 03 critique F-26): the focus-mode slot, whose first consumer is the solutions viewer. See "Deferred".

R-37. The shell must expose a bottom-bar slot for a page's primary action below 768 pixels, and move header actions into it when a page gives no bottom bar (`../design/shell/spec.md`, "Design Notes", `DEC-25`).

R-38. Below 768 pixels the shell must show no sidebar. The header carries the tenant mark, the page title, and the drawer control. The drawer is full height, capped at 84 percent of the viewport width, opens over a dimmed scrim, and closes on scrim tap and on route change (`../design/shell/spec.md`, "Responsive Behavior").

R-39. The shell must read branding for the tenant identity block, the logo or letter tile, the company name, the product name, and the footer links, through the branding reader on the tenant context (`DEC-34`, `DEC-46`).

R-40. The shell must show no notification surface until the Notifications page ships in roadmap Section 6 item 5 (`DEC-21`, `../design/shell/spec.md`, "Navigation Structure"). Amended 2026-10-20 and 2026-10-22 (owner): the page then opens only from a bell with an unread count in the header of both chromes, which links to `/notifications` in the workspace chrome and to `/admin/notifications` in the admin chrome. There is no navigation entry and no dropdown panel. Revised 2026-10-22 (owner, spec 03 critique F-20): the header layout keeps a reserved slot for search and room for the bell beside the actions, at a phone viewport. Section 3 ships no search box. Modules ship their own search pages, and a global header search is deferred (see "Deferred").

R-41. Every user-facing string in the shell and in every screen of this section must go through the `next-intl` message catalog installed in Section 0. No string is written inline (`DEC-13`, `../core/roadmap.md`, Section 0 item 9).

R-42. The standard security headers set once in the app extend to the workspace shell. Ordinary shell documents retain the exact Section 0 minimal CSP, including `frame-src 'none'`, without nonce wiring; they invoke no frame-origin provider and make no frame-origin-record query. Rendering the shell around an iframe viewer does not create a second policy path: only the server-owned iframe-viewer document route invokes its owning module's provider under Section 0 R-49/R-49a. Shell links entering such a viewer use full document navigation so that its origin policy is installed before the iframe renders. Prefetch/RSC and other background navigation requests invoke no provider. Section 0 proves the viewer path with its placeholder viewer fixture. Section 3 proves only that shell documents keep the minimal policy with the branding styles in place (AC-4a), without depending on Section 4 solutions (`../core/roadmap.md`, Section 0 item 11 and Section 3 item 4; `../architecture/module-contract.md`, Content security policy provider; `DEC-31`).

### Branding pages (item 5)

R-43. The admin portal must carry a Branding page behind `core:branding:manage` with three tabs: Identity, Colors and theme, and Sign-in page (`../core/roadmap.md`, Section 3 item 5). Every tab edits one browser-side draft and shows a live preview of the setting where it lands (`../design/sections/branding/spec.md`, "Overview"). The Typography, Email, Links, and Locale values come from `branding.seed.json` through `genie-ops setup` (`../architecture/branding-seed.md`) and are not editable in the app until their tabs are reopened (owner decision 2026-10-19, see "Deferred").

R-44. One Publish must write the whole draft to `tenant_branding` in one transaction and write one `audit_event` row naming the changed fields, with the action `core:branding_published` (R-90a). Discard drops the draft. Unpublished changes are guarded by the browser's own unload prompt and by no in-app leave dialog (`../design/sections/branding/spec.md`, "User Flows").

R-45. Publish must go through one `applyBranding` step in core, which writes the branding row only. Section 3 creates the step. Before it, the setup seed is the only writer of the row. Nothing from branding is written to the Keycloak realm (`DEC-40`, Guard).

R-46. Revised 2026-10-22 (owner, spec 03 critique F-2 and F-26) and 2026-10-25 (owner, code review CR-BRANDING-L2 and drift finding DR-05). The Branding page must check five named contrast pairs and show one pill per pair. Each pill shows its ratio, its target, and a Pass, Warning, or Fail word. The Colors and theme tab shows four: Fill, Text on nav, Count pill, and Focus ring. Fill and Count pill check the stored foreground on the tenant color. Text on nav checks the tenant color on the light navigation surface. The Focus ring pair checks the tenant color against white and against the subtle surface, for WCAG 2.1 success criterion 1.4.11. The Sign-in page tab shows the fifth pill, Sign-in text. It checks the fixed light-theme `--foreground` and `--muted-foreground` on the sign-in background color of R-54, at the lower of the two ratios. The dark sign-in page keeps `--background`, so this pair is checked in the light theme only. The rule has two levels. Publish is blocked while any pair is below 3:1. Fill, Text on nav, Count pill, and Sign-in text are text pairs. Between 3:1 and 4.5:1 a text pill shows a warning and Publish works. At 4.5:1 or more the pair passes. The Focus ring pair passes at 3:1 and has no warning band. No pill offers an automatic fix. The 2026-10-25 revision changes the 2026-10-22 critique decision "R-46 keeps the contrast pills and the publish block" (F-26). The pills and the block stay, but the block now starts below 3:1, not below 4.5:1, because a seeded color between the two levels blocked every Publish. A warning-only rule for every pair was rejected, because an unreadable button is not acceptable. There is no dark text or dark ring pill, because those use the fixed `--brand-on-dark` of R-15, which the fixed layer proves once (`../design/sections/branding/spec.md`, "User Flows" and "UI Requirements", `../design/design-system/tokens.md`, "Focus ring").

R-47. The Colors and theme tab must show no tint strip, because `DEC-47` derives no ramp. It must show the computed foreground swatch. Revised 2026-10-22 (owner, spec 03 critique F-2): it shows no derived dark value. A note states that brand text and the focus ring use one fixed light color on dark surfaces.

Amendment 2026-09-21: initial branding follows the [approved seed requirements](../architecture/branding-seed.md), including required customer identity/locale/time zone, deferred application-email configuration, standard appearance defaults and notice validation. Its open questions are not implementation defaults. Earlier column inventories do not require every column to be authored.

R-48. Deferred with the Typography tab (owner decision 2026-10-19); the seed sets these values. When the tab is reopened: the Typography tab must offer the font from the approved list of R-11, the three font size presets with a sample sentence at the chosen size, and the light-surface text color with two contrast pills at 4.5:1, against white and against the subtle surface. Publish is blocked while either fails. The tab must state that the size preset sets the root size and that the text color applies to light surfaces only (`../design/sections/branding/spec.md`, "User Flows").

R-49. Image uploads on the Identity tab must go through the core `FileStorage` service in one request. Revised 2026-10-22 (owner, spec 03 critique F-1 and F-15): the Sign-in page tab takes no image while sign-in branding is text-only. A branding image must be png, svg, webp, or ico, and no larger than 1 MB, which stays below the deployment limit from `FILE_MAX_BYTES` (`DEC-20`, `DEC-44`, `../architecture/environment-contract.md`, "Files"). Any other type is refused, including PDF and office files. An uploaded SVG is sanitized in core before the bytes are stored. The branding row stores the `file.id` in the matching column of `../architecture/data-shape.md`, "Branding". An image is shown to members and in the preview only when its `scan_status` is `clean` or `skipped`. Branding images use the `postgres` adapter until the `s3` adapter arrives in Section 6. Then they move with `genie-ops files migrate` (`DEC-20`).

R-50. The Scanning and Infected states must be designed and unreachable in this release. `file.scan_status` stays `skipped` until a scanner exists, and the implementation must not fake a state (`DEC-20`, `../design/sections/branding/spec.md`, "UI Requirements").

R-51. Deferred with the Email tab (owner decision 2026-10-19); the seed sets these values. When the tab is reopened: the Email tab must edit sender display name, reply-to, and footer text only. The sender address is the deployment's `MAIL_FROM` and is not editable (`../architecture/environment-contract.md`, "Mail"). The tab must state that for a local-account deployment the sender name and reply-to also apply to the realm SMTP settings, and that the three credential emails are Keycloak's built-in templates carrying the realm display name only (`DEC-40`).

R-52. Deferred with the Locale tab (owner decision 2026-10-19); the seed sets these values. When the tab is reopened: the Locale tab must offer language, time zone, date format, and number format, and the language select must be disabled while one language is available, with the note the design gives (`DEC-13`, `../design/sections/branding/spec.md`, "UI Requirements"). There is no currency field.

R-53. The Branding page must be designed and built mobile first. Below 768 pixels Discard and Publish move into a sticky bottom bar, the tab strip scrolls with the active tab in view, and the preview collapses behind a toggle (`DEC-25`, `../design/sections/branding/spec.md`, "UI Requirements").

### Sign-in page and email templates (item 6)

R-54. The sign-in page must read branding for the background color, the welcome text, the support contact, the system-use notice and its acknowledgement flag, and the company and product names, through the branding reader. Revised 2026-10-22 (owner, spec 03 critique F-1): sign-in branding is text and color only. The page shows the company name as text, not the logo. The logo, the background image, and a branded favicon on the sign-in page are deferred (see "Deferred"). The page itself is Section 2 item 1 work. Section 3 supplies the branding read and the token layer it renders in (`../core/roadmap.md`, Section 3 item 6).

R-55. The React Email templates must read the deployment branding as text and color only (owner, 2026-10-22, spec 03 critique F-1). They show the company name as text and no logo. They read company name, product name, primary color and its stored foreground, font family, sender name, reply-to, footer text, support contact, and the terms and privacy links. The template must read `tenant_branding.primary_foreground` and must never recompute it (`../design/sections/email-templates/types.ts`, `EmailTenant.primaryForeground`).

R-56. Every template must render an HTML part and a plain-text part with the same content in reading order and links written out in full (`../core/roadmap.md`, Section 1 item 8, `../design/sections/email-templates/spec.md`, "UI Requirements").

R-57. Links in an email body must be built from `PUBLIC_URL`. The sender address is `MAIL_FROM` and carries the branding display name (`../architecture/environment-contract.md`, "Required" and "Mail").

R-58. Nothing from branding must be written to the Keycloak realm. The realm display name equals the company name and is set by provisioning. The credential emails of a local-account deployment stay Keycloak's built-in templates (`DEC-40`).

R-59. Revised 2026-10-22 (owner, spec 03 critique F-7). The template set must be the five templates of `MAIL_TEMPLATE_IDS` in `packages/core/src/services/mailer/catalogue.ts`. The design's sixth template, the local-account invitation, was dropped by Spec 02 R-40a. Section 3 owns their branded rendering. Section 2 item 8 owns the events that send them.

R-59a. Added 2026-10-22 (owner, spec 03 critique F-7). The email renderer must take a typed branding object built from the branding reader, beside the template variables. The object holds text and color values only (R-55). The layout reads every color, name, and footer from it and hard-codes none.

### Personal overrides (item 7)

R-60. Deferred 2026-10-22 (owner, spec 03 critique F-24): the Preferences block for language and time zone on the account page. Everyone sees the tenant language and time zone, as pages do today. Theme stays an organization setting with no personal choice (owner decision 2026-10-19). See "Deferred".

R-61. Deferred 2026-10-22 (owner, spec 03 critique F-24): resolving language and time zone from `user_preference` before `tenant_branding`. See "Deferred".

R-62. The break-glass account page variant must show no Preferences block and no roles block (`DEC-24`, `../design/sections/account-and-inbox/spec.md`, "UI Requirements"). Revised 2026-10-22 (consistency check C-3): Spec 02 R-66 already builds and tests this variant, so Section 3 does no work for it. The rule applies again when item 7 returns, and AC-7 checks it then.

### Design review (item 8)

R-63. Revised 2026-10-22 (owner, spec 03 critique F-26). No separate design review record is written. Instead, each ticket's definition of done requires three checks on every screen and part it builds. Its Storybook story matches the design. The anti-slop browser scan is clean. The axe check of R-66 passes. The designs in scope are `design-system/tokens.md`, `shell`, `sections/branding`, `sections/email-templates`, the Section 3 parts of `sections/account-and-inbox`, and the Section 3 parts of `sections/audit-and-tenant-settings`.

R-64. Where a design file and a platform document disagree, the platform document wins and the disagreement is reported. Where a reference component and `../design/design-system/tokens.md` disagree, the token file wins. The reference components are not built on (`../design/reference/README.md`, rules 1 and 4).

### Accessibility (item 9)

R-65. WCAG 2.1 AA is the target for every screen in this and later sections (`DEC-21`).

R-66. Every end-to-end screen must be scanned with axe-core through Playwright with the WCAG 2.0 A, WCAG 2.0 AA, WCAG 2.1 A, and WCAG 2.1 AA tag set, and a violation must fail the test (`DEC-21`, `../core/tech-stack.md`, "Quality").

R-67. Focus order must follow reading order on every screen. A clickable table row keeps its own buttons after the row in the tab order (`../design/design-system/tokens.md`, "Tables and card lists").

R-68. An input border must hold 3:1 against its surface, because the border is the boundary of a component. Decorative hairlines are exempt (`../design/design-system/tokens.md`, "Forms and feedback", WCAG 2.1 success criterion 1.4.11).

R-69. The offline bar, toasts, spinners, and inline errors must announce through a live region or a role, and the idle countdown must update inside a `role="timer"` region (`../design/design-system/tokens.md`, "Live regions").

R-70. Reduced motion must be proven, not assumed. One end-to-end test runs with the reduced-motion preference set and asserts that no transition or animation runs (R-7).

R-71. Dropped 2026-10-22 (owner, spec 03 critique F-26): the separate manual accessibility review record per design round. The per-ticket checks of R-63 and the screen-reader pass under "Verification" replace it. See "Deferred".

### Tenant Settings (item 10)

R-72. Tenant Settings requires `core:settings:manage` and uses Navigator A: section navigation plus one selected detail form, with phone list/detail navigation. Core sections cover Onboarding, Local accounts and Sessions using the existing `tenant_settings` fields. Forms are not stacked for every module. Section links open the corresponding section/field; warn before navigation discards dirty edits. The page has no search while R-75a is deferred (owner, 2026-10-22, spec 03 critique F-21). Source: `../architecture/module-contract.md`, Settings discovery and authorization (accepted 2026-09-19).

R-73. The idle timeout field must accept 5 to 480 minutes with a default of 15, and the card must state that the change applies to new sessions and to existing sessions on their next activity (`DEC-46`, `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows"). The application enforces this setting per request. It is independent of the realm's own single sign-on idle and maximum lifetimes, which are fixed template values, so changing it here writes nothing to Keycloak (`DEC-46`, `README.md` in this folder, "Cross-section calls made in the drafting round", Realm session settings row).

R-74. The Local accounts switch must be disabled when `tenant_settings.realm_supports_local_accounts` is false, with the note the design gives. That column is written once by the realm step of `genie-ops setup` from the template variant it applied, and this page never reads the realm for it (`../architecture/data-shape.md`, `tenant_settings`; `DEC-36` as amended 2026-09-18; `../design/sections/audit-and-tenant-settings/types.ts`, `TenantRealm`).

R-75. Each compiled module with a `configuration.schema` contributes a Settings section in module order, including disabled modules through the authorized core pre-enable configuration path. Absent/excluded modules and modules without schemas contribute nothing. Revised 2026-10-22 (owner, spec 03 critique F-14): core converts the module's `configuration.schema` with `z.toJSONSchema()` and merges the field metadata of `configuration.fields`, such as titles. `ConfigForm` in `packages/ui` takes plain JSON Schema and metadata props, and imports nothing from core. It renders the selected form with TanStack Form and Base UI (`DEC-28`). Saving does not enable the module or clear reintroduction review.

R-75a. Deferred 2026-10-22 (owner, spec 03 critique F-21): the Tenant Settings fuzzy search and its per-field index. See "Deferred". The server-side permission rules stay in force: direct links, reads and saves require `core:settings:manage` AND any additional section permission. A module admin key alone is insufficient. Source: the canonical Settings discovery and authorization boundary.

R-76. `ConfigForm` must support exactly five field kinds: string, number, boolean as a switch, enum as a select, and string list. It must carry title, description, and the constraints the schema declares: minimum, maximum, pattern, maximum length, and item limit. It must never grow into a form engine. A module whose schema uses any other shape fails its contract test at build time (`DEC-28`, `../architecture/module-contract.md`, Configuration schema row).

R-77. The save procedure must validate with the same zod schema the module declared in `configuration.schema`, passed to the form as a Standard Schema validator with no adapter package, and must write to `tenant_module.config` (`DEC-28`, `../core/tech-stack.md`, "Web application", Forms row).

R-78. The placeholder module must declare a `configuration.schema` that exercises all five field kinds, and the Tenant settings page must show it in development and in test. The placeholder module is never compiled into a customer image (`DEC-28`, `README.md` in this folder, "Terminology").

R-79. Each section saves independently with one audit event of R-90a and the shared toast. Explicit Discard resets that section; leaving it with unsaved edits requires confirmation. Validation or server refusal preserves edits and supplies an actionable error. Saving module configuration never enables the module. Source: R-72/R-75 and the canonical Settings discovery and authorization boundary.

R-80. Validation messages must be one per field kind as `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows", fixes them. A stored value that fails the schema shows its message on load. Other fields show theirs on blur. Save is disabled while any field is invalid.

### Modules and Categories (item 11)

R-81. The admin portal must carry a Modules page behind `core:settings:manage` listing every module compiled into the image, enabled or not, in image order (`DEC-50`).

R-82. The enabled switch must write `tenant_module.enabled` through one core procedure, and `genie-ops module enable|disable` must call the same procedure. No second writer exists (`DEC-50`, Guard, `README.md` in this folder, "Section boundaries", `genie-ops` row). That procedure is also what appends the module admin key `<id>:admin` to `Tenant administrator` on enable and removes it on disable (`DEC-23`, `README.md` in this folder, "Cross-section calls made in the drafting round", Module admin key row).

R-83. Switching a module off must open the shared confirm dialog in the danger tone with Cancel focused. Switching one on saves at once (`../design/sections/audit-and-tenant-settings/spec.md`, "User Flows"). The confirm copy and the audit wording are the design's choice and stand (`DEC-50`, "Left to the design").

R-84. The category picker must write `tenant_module.category_id` and must show for every module with at least one static workspace entry, which includes the solutions module whose static entry is its hub. A module with no static workspace entry shows no picker (`DEC-50`, `DEC-49`, `../design/sections/audit-and-tenant-settings/types.ts`, `CompiledModule.categoryId`).

R-84a. A newly introduced module on an existing deployment appears disabled pending administrator configuration and explicit enablement (DEC-50 addendum; Section 1 R-27/R-68a). Provide an authorized core configuration path before enabling, even while module-owned screens remain unavailable. Validate declared required values through the shared enable procedure and show actionable errors without switching the module on. Saving configuration is not activation. This extends the configuration-card visibility requirement for compiled, disabled modules needing setup; the design handoff must include this state. Existing module settings and access assignments are preserved.

R-85. The Access column must read holders from `role_assignment`: the groups and people holding a role that carries the module's `<id>:use` key, with a link to the Roles screen. Nothing on the Modules page assigns a role, because a second writer of `role_assignment` is what `DEC-39` forbids (`DEC-50`).

R-86. Whether a switched-off module still lists its holders is the design's choice and stands: they are kept, muted, with an off pill (`DEC-50`, "Left to the design").

R-86a. The Section 3 core migration must create `category` and `user_preference`, and must add the foreign key from `tenant_module.category_id` to `category.id`. The column stays nullable and the constraint is declared on delete set null, so deleting a category leaves its modules ungrouped and the delete of R-89 needs no application-side sweep (`DEC-51`, `../architecture/data-shape.md`, "Navigation" and "Deployment tables", `README.md` in this folder, "Section boundaries", Deployment tables row). Section 1 item 1 created `tenant_module.category_id` without that foreign key, so this is an expand migration and carries no drop (`DEC-43`). Revised 2026-10-22 (owner, spec 03 critique F-16): the same migration first sets every `tenant_module.category_id` that names no `category` row to null, and only then adds the foreign key. A hand-edited database then upgrades without a failure.

R-87. The admin portal must carry a Categories page behind `core:settings:manage` that creates, renames, reorders, and deletes rows of the core `category` table. Reorder works by drag and by up and down controls, so it is reachable by keyboard and on a phone (`DEC-51`, `DEC-25`).

R-88. The member count on the Categories page must come from `tenant_module.category_id` only. There is no solutions count, because `solution_category` is a module table that core does not read (`DEC-51`). A fixed row at the bottom carries the count of ungrouped modules.

R-89. Deleting a category must leave its members ungrouped and must touch no module table. The confirm dialog names the module count and says that solutions in the category lose their heading, without a number (`DEC-51`, `../design/sections/audit-and-tenant-settings/spec.md`, "User Flows").

R-90. Every change on the Modules page and the Categories page must write one `audit_event` row of R-90a and show the shared toast (`DEC-50`, `DEC-51`).

R-90a. Added 2026-10-22 (owner, spec 03 critique F-13). The audit actions of this section are `core:branding_published`, `core:settings_updated`, `core:module_configured`, `core:module_enabled`, `core:module_disabled`, `core:module_category_set`, `core:category_created`, `core:category_renamed`, `core:category_reordered`, and `core:category_deleted`. They are added to `AUDIT_ACTIONS` in `packages/core/src/services/audit/actions.ts`. The page caller writes the one `core:` row. The shared procedure writes none, so the `genie-ops module` command path keeps its own `ops:` row (`DEC-45`) and no change writes two rows.

R-91. A category id that no longer exists must be treated as no category by every reader, in the shell tree and in a module (`DEC-51`).

R-91a. Revised 2026-10-22 (owner, spec 03 critique F-22). The same Categories page must offer Assign items for whole modules with static workspace entries, using the searchable transfer-list pattern. Core writes whole-module placement to `tenant_module.category_id`. Whole-module placement remains available when a module is disabled, and excluded modules contribute nothing. Category assignment never changes access grants. R-88's summary counts remain module-only. Record-level assignment through module providers, including solutions, moves to Section 4 (see "Deferred").

### Cross-cutting

R-92. Every screen in this section must be designed and built mobile first, with the phone layout as the base. Tables become card lists and side inspectors become full-height sheets on small screens. No action is desktop-only (`DEC-25`).

R-93. A screen the person may not open must be hidden from navigation, and its route must refuse on the server. The route is not unmounted, and no screen renders a denied state of its own (`DEC-39`, `README.md` in this folder, "Cross-section calls made in the drafting round", Permission-gated route row, `../design/sections/audit-and-tenant-settings/types.ts`, `AuditAndTenantSettingsProps`). The refusal is the one `can()` seam, answered by the per-request loader of `DEC-48`.

R-94. Server state on every screen of this section must live in TanStack Query through oRPC, complex client state in zustand, and trivial local state in `useState` (`../core/tech-stack.md`, "Web application"). The Branding draft is complex client state.

R-95. No screen in this section may check a permission outside `can()` or filter a list outside `scopesFor()` (`DEC-39`). The shell renders navigation from `can()` answered by the one per-request loader, so a tree of a dozen entries costs one assignment read (`DEC-48`).

R-84b. Moved to Section 5 on 2026-10-22 (owner, spec 03 critique F-23): the review screens for a module that was removed and brought back, [CF-MA-10 to CF-MA-11](../flows/module-access-upgrades.md), built with controlled removal (bead `6nm`, `05-operations.md` R-26b). R-84a stays in this section. See "Deferred".

## Acceptance criteria

One criterion per roadmap work item, then one per clause of the definition of done.

AC-1 (item 1, proves R-1 to R-11). `packages/ui` exports the token layer. A unit test asserts the six type roles, the three control heights, the radius values, and the motion duration band against `../design/design-system/tokens.md`. The repository check of R-4 fails a branch that introduces an arbitrary pixel text size and passes on the clean tree. A build test asserts that no font URL outside the image appears in any emitted stylesheet, and that only the default face and the mono face ship. The app stylesheet imports the font CSS export of `packages/ui`, and no `next/font` call exists. The document preloads one font file, the default face weight that the sign-in page paints first. A unit test asserts that the approved-list constant holds `plus-jakarta-sans` only. Added 2026-10-22 (owner, spec 03 critique F-4): a unit test asserts that the fixed layer defines every variable of R-1 in both themes, and that `--brand-on-dark` holds 3:1 or more against the dark surfaces. The anti-slop browser scan is clean on every existing story.

AC-2 (item 2, proves R-12 to R-18). Revised 2026-10-22 (owner, spec 03 critique F-5 and F-17). A unit test covers a pure `brandingTokens(branding)` emitter. Given a branding value, it returns `--primary`, `--primary-foreground`, `--sign-in-background` (R-13), the root font size, and `--font-sans` set to the default face, and no other color variable. It returns no `--foreground`, which stays fixed (R-14). Given no branding row, it returns the fixed defaults of R-12a. A second assertion proves no tint ramp variable exists. An integration test builds two tenant contexts against two databases with different `tenant_branding` rows and runs the emitter through each, and each returns its own values. An end-to-end test proves the real document: it reads the emitted variables on a shell page, body text resolves its font family through `--font-sans` to the default face, and the not-set-up route renders with the fixed defaults. The same test changes the primary color, waits past the 10 second reader window, reloads, and sees the new value. A further check proves that `dark:` classes follow `data-theme` on `<html>` and not the operating system setting.

AC-3 (item 3, proves R-19, R-19a, R-19b, R-19c, and R-20 to R-26). The spike of R-19b closes first. `packages/ui` holds `components.json` and `@base-ui/react`, one Base UI primitive renders in a documented story, and `../core/tech-stack.md` records the setup. No other primitives ticket starts before then. Vitest browser-mode component tests cover Button, Input, Select, Dialog, Table, Toast, Switch, and Tabs: each renders at the default height, takes the focus ring constant, and exposes its role. They also cover the shared parts of R-25: the empty state block, the skeleton loader, the spinner, the status pill, the label pill, the mono chip, and the count pill. The spinner exposes `role="status"` with a visually hidden label. Table renders as a card list below 768 pixels. Dialog is 480 pixels on desktop and full width with a bottom action bar on a phone viewport. An import test proves `packages/ui` pulls in nothing internal. Added 2026-10-22 (owner, spec 03 critique F-3 and F-8): a build test builds `apps/genie` and finds in the emitted CSS a known class from `packages/ui`, one from `packages/core`, and one from each module the image includes. The lint check of R-19a fails a branch that adds a second `ConfirmDialog` or `focusRing`, and `packages/core/src/features/admin/ui.tsx` no longer exists. An import test proves that People, Groups, Roles, and the other Section 2 screens that used the core kit import their primitives from `packages/ui`.

AC-4 (item 4, proves R-27, R-28, R-29, R-29a, R-30, R-31, R-32, R-33, R-34, R-35, R-37, R-38, R-39, R-40, R-41, and R-42). An end-to-end test signs in and lands on the entry marked the landing route. A registry unit test fails a build in which two entries carry the flag, and a second end-to-end run with the landing module disabled opens the no-grants empty state instead. A module whose category is set on the Modules page moves its static entry from the workspace block under that heading, and its landing-route flag survives the move. The workspace sidebar shows only entitled modules the person may reach, grouped by core categories, with entries of a deleted category in the ungrouped area. A person with no grants sees the empty state. The account menu shows the chrome switch only for a person with a core admin permission. Collapsing a category and reloading keeps it collapsed on the same device and not on another. The offline event shows the full-width bar above the sidebar. The drawer opens below 768 pixels and closes on route change. The idle dialog appears before server expiry and "Stay signed in" keeps the session. A header assertion proves the content security policy and the other headers of `DEC-31` are present on a shell route. At a phone and a desktop viewport the header shows its reserved search slot empty, with no search box and no notification bell. A test app outside `apps/genie` composes the shell from `packages/core` and renders both chromes. A contract test proves that the static entry type of the module contract has no `categoryId` field and that the placeholder module declares none. The shell ticket's review confirms that the shell extends `landingRoute`, `permittedNavigation`, and `SessionActivity`, and adds no second landing resolver, navigation filter, or idle timer.

AC-4a (shell CSP scope, proves R-42). Revised 2026-10-22 (owner, spec 03 critique F-26). AC-4's header check, plus one assertion that the branding style element and the pre-hydration theme script render and apply under the minimal policy, with no nonce. The iframe-viewer proof stays with the Section 0 fixture tests, and Section 4 repeats it with its real viewer.

AC-5 (item 5, proves R-43, R-44, R-45, R-46, R-47, R-49, R-50, and R-53). An end-to-end test opens Branding, edits a field on each of the three tabs, sees the preview change and the unpublished indicator count rise, presses Publish, confirms, and finds one `core:branding_published` row naming the changed fields and one updated `tenant_branding` row. A color below 3:1 on any of the five named pairs of R-46 blocks Publish, and a color between 3:1 and 4.5:1 on a text pair shows a warning pill and leaves Publish enabled. On the Identity tab a png, an svg, a webp, and an ico logo each store a `file` row through the `postgres` adapter and show in the shell preview. A new upload has `scan_status` `skipped` (R-50). A file at the 1 MB limit is accepted and a larger one is refused. A PDF upload is refused. An SVG that carries a script element or an event handler attribute is stored without them. An integration test sets a stored image's `scan_status` to `pending` and to `infected`, and the image then shows neither in the preview nor in the shell. No Keycloak admin call is made during the publish.

AC-6 (item 6, proves R-54 to R-59a). Revised 2026-10-22 (owner, spec 03 critique F-1 and F-7). An end-to-end test publishes a branding change and then asserts the new company name as text and the primary color on the sign-in page and in a rendered email, with no logo image on either. A unit test renders each of the five templates against two typed branding objects and asserts that every color, name, link, and footer follows branding with no template change, that the plain-text part carries the same content in reading order, and that the stored `primary_foreground` is used unchanged.

AC-7 (item 7). Deferred 2026-10-22 (owner, spec 03 critique F-24) with R-60 and R-61. See "Deferred". The account page shows no theme control, which AC-4 checks with the account menu.

AC-8 (item 8, proves R-63 and R-64). Revised 2026-10-22 (owner, spec 03 critique F-26). No review record is written. Each ticket closes only when its Storybook story matches the design, the anti-slop scan is clean, and the axe check of R-66 passes.

AC-9 (item 9, proves R-65 to R-70). The axe scan of R-66 runs on every end-to-end screen of this section at a phone viewport and a desktop viewport and reports no violation. A keyboard test walks the shell, the Branding page, and the Tenant settings page in reading order. The reduced-motion test of R-70 passes.

AC-10 (item 10, proves R-72 to R-75, the retained permission rule of R-75a, and R-76 to R-80). An end-to-end test signed in as a tenant administrator changes onboarding mode, local accounts, and idle minutes, and each save writes one `core:settings_updated` row. The idle minutes field shows 15 by default, accepts 5 and 480, and refuses 4 and 481 with its fixed message. With `realm_supports_local_accounts` false, the Local accounts switch is disabled and shows the design's note. A stored value that fails the schema shows its message on load. Another field shows its message on blur. Save stays disabled while any field is invalid. The placeholder module's configuration section renders all five field kinds, refuses an invalid value with the fixed message, and saves valid values into `tenant_module.config`. Its save writes one `core:module_configured` row. A module that declares no `configuration.schema` shows no section. A unit test proves that core converts the schema and merges the `configuration.fields` metadata into the props `ConfigForm` takes. A contract test proves a module schema using a sixth shape fails at build time. A person without `core:settings:manage` sees no navigation item, and the procedure refuses a direct call.

AC-11a (item 11 migration, proves R-86a). An integration test against a Testcontainers Postgres applies the core history and asserts that `category` and `user_preference` exist, that `tenant_module.category_id` carries a nullable foreign key to `category.id` declared on delete set null, and that deleting a category row sets the column to null on every module that named it, with no other row touched. Added 2026-10-22 (owner, spec 03 critique F-16): a database whose `tenant_module.category_id` names no `category` row upgrades, and that value becomes null. A second assertion proves the migration upgrades a database that already holds Section 1 and Section 2 rows, so the release upgrades from the last three (`DEC-43`).

AC-11 (item 11, proves R-81, R-82, R-83, R-84, R-85, R-86, R-87, R-88, R-89, R-90, R-90a, and R-91). An end-to-end test lists every compiled module, switches one off through the confirm dialog, and proves that its navigation entry disappears and its routes refuse. A second test runs `genie-ops module disable` for the same module and proves the same procedure wrote the same row. A category is created, renamed, reordered, assigned to a module, and deleted, and the module falls into the ungrouped area with no module table touched. The Categories count matches `tenant_module.category_id` alone. Access lists the holders read from `role_assignment` and links to Roles, and no role is assignable from the page. A switched-off module keeps its holders, muted, with an off pill. Every change on the page leaves exactly one `audit_event` row with its `core:` action of R-90a. A `genie-ops module` command run leaves exactly one `ops:` row and no `core:` row.

AC-11b (item 11, first enable, proves R-84a). An end-to-end test uses a compiled test module whose schema declares a required value. The module arrives disabled with that value unset. Enabling it shows an actionable error that names the field, and the module stays off. The administrator saves a valid value through the core configuration path, and the module is still off. Enabling then succeeds. The module's existing settings and access assignments are unchanged after both attempts.

AC-12 (done-when, a branding change shows on the sign-in page, proves R-12, R-54). The end-to-end branding test of AC-6 asserts the published company name as text, the welcome text, and the primary color on the sign-in page. Revised 2026-10-22 (owner, spec 03 critique F-1): no logo is asserted.

AC-13 (done-when, a branding change shows on the shell, proves R-12, R-39). The same test signs in and asserts the published logo, company name, and primary accent in the shell.

AC-14 (done-when, a branding change shows on an email, proves R-55, R-56). The same test triggers one template, captures the rendered email, and asserts the published company name as text, primary color, sender name, and footer text in both parts. Revised 2026-10-22 (owner, spec 03 critique F-1): no logo is asserted.

AC-15 (done-when, light and dark themes, proves R-14, R-15, R-17). AC-12 to AC-14 each run once with the tenant default theme light and once dark. The email stays light in both runs, as `../design/sections/email-templates/spec.md`, "UI Requirements", fixes.

AC-16 (done-when, focus order, proves R-8, R-67). A keyboard walk of the shell, Branding, Tenant settings, Modules, and Categories reaches every interactive element in reading order, and each shows the shared focus ring.

AC-17 (done-when, contrast, proves R-9, R-15, R-46, R-68). The axe scan reports no contrast violation on any screen of this section, in both themes. The five named branding pairs of R-46 are proven by unit tests over the contrast function, with fixtures below 3:1 (Publish blocked), between 3:1 and 4.5:1 (a warning on a text pair, Publish allowed), and at 4.5:1 or more (pass). The fixed `--brand-on-dark` pairs are proven by the fixed-layer test of AC-1. The two typography pairs of R-48 return with the Typography tab.

AC-18 (done-when, reduced motion, proves R-7, R-70). The reduced-motion end-to-end run shows no transition and no animation on the shell, the drawer, the dialog, and the toast.

AC-14a (module return). Moved to Section 5 on 2026-10-22 (owner, spec 03 critique F-23) with R-84b. See "Deferred".

AC-19 (accepted Categories/Settings decisions, proves R-72, R-75, the retained permission rule of R-75a, R-79, and the whole-module placement of R-91a). Revised 2026-10-22 (owner, spec 03 critique F-21 and F-22). Unit/contract tests cover stable link resolution and additional-permission AND semantics. Integration tests prove baseline-only, baseline-plus-required-key, module-key-only and no-key cases on reads and writes. A disabled compiled module can save valid configuration without enabling; an excluded module has no section. Phone/desktop stories and E2E prove the Categories transfer list places whole modules, then section navigation, focus, stale links, independent saves and dirty-navigation recovery. The search cases move to "Deferred" with R-75a. The record and provider cases move to Section 4 with R-91a. See `../flows/categories-and-settings.md`.

AC-19a (cross-cutting structure, proves R-41, R-92, R-93, R-94, and R-95). Every end-to-end test of this section runs at a phone viewport and a desktop viewport, and no action is reachable at desktop width only. For each screen of this section, a person without its permission sees no navigation entry, and a direct request to its route is refused by the server. A lint rule, or a test where no rule exists, fails a branch that renders a string literal as user-facing text in the shell or in a screen of this section. Each ticket's review confirms that server state uses TanStack Query through oRPC, that the Branding draft lives in a zustand store, and that trivial local state uses `useState`. An import check fails a branch in which a screen of this section reads `role_assignment` directly or imports a permission helper other than `can()` and `scopesFor()`.

## Verification

Landing-route tests in this section use test-only navigation fixtures for a reachable flagged entry, no flagged entry, and a disabled or inaccessible flagged entry. They must not require the Section 4 solutions implementation or add a flag to the shipped placeholder. Section 4 repeats the successful landing path with the real solutions entry.

Unit, Vitest. The contrast function, with fixtures below 3:1, between 3:1 and 4.5:1, and at 4.5:1 or more for each of the five named pairs of R-46. The `brandingTokens(branding)` emitter, with and without a branding row. The token constants against `../design/design-system/tokens.md`. The navigation tree builder: entries with a category, entries without one, an entry whose category id no longer exists, the six-entry pinned cap, and the landing-route flag. The `z.toJSONSchema()` conversion into the five `ConfigForm` field kinds, and the refusal of a sixth shape. The five email templates against two typed branding objects, HTML and plain text.

Component, Storybook Vitest addon in browser mode using the Section 0 harness. Each primitive of R-19, the `ConfigForm` field kinds, the confirm dialog focus rule, the toast stack, and the idle dialog countdown region have colocated documented stories and applicable interaction/accessibility tests following `../architecture/ui-development.md`. AC-3 is proved through this layer, including phone/desktop states and shared theme tokens. Core feature stories live with core; the host composes them without UI-to-core imports. The section delivers the full primitive catalogue; Section 0 does not preimplement it. Component tests supplement the real integration and E2E requirements below.

Integration, Vitest with Testcontainers against a real Postgres with the real migration histories. The branding publish transaction and its audit row. The settings save and its audit row. The module enable procedure called from the page path and from the command path, proving one writer. The Section 3 migration of R-86a on a database that already holds Section 1 and Section 2 rows, asserting the two new tables and the on delete set null foreign key. The category create, rename, reorder, and delete, proving no module table is touched and the count comes from `tenant_module.category_id`. The two-context isolation test of `DEC-34` extended with the branding reader, proving each context returns its own token layer through `brandingTokens`.

End-to-end, Playwright against one seeded deployment, every test at a phone viewport and a desktop viewport (`DEC-25`). The branding round trip of AC-12 to AC-15. The shell navigation, empty state, drawer, offline bar, and idle dialog. The Tenant settings, Modules, and Categories flows. The axe scan of R-66 on every screen. The reduced-motion run of R-70.

Manual. A screen-reader pass over the shell, the idle dialog, and the Branding contrast pills. A visual check of the two themes against the design captures, with `../design/design-system/tokens.md` as the arbiter where a capture disagrees.

Static. The arbitrary pixel text size check of R-4. The lint check of R-19a against a second `ConfirmDialog` or `focusRing`. The oxlint import direction rules, which must keep `packages/ui` free of internal imports and keep `packages/core` importing `packages/ui` only.

## Deferred

- The Typography, Email, Links, and Locale branding tabs. Owner decision 2026-10-19 (simplification audit): the first release ships the Identity, Colors and theme, and Sign-in page tabs, and the other values come from `branding.seed.json`. Reopens when a customer asks to edit them in the app; R-48, R-51, and R-52 keep the tab requirements, and the Links values follow the seed through the support link of R-32 and the sign-in page.
- The Notifications page and the header bell. Designed in `../design/sections/account-and-inbox/spec.md` and `../design/shell/spec.md`. Deferred by `DEC-21` to roadmap Section 6 item 5. The shell header keeps room for the bell, and the bell is not rendered until then.
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

Added 2026-10-22 after the spec 03 critique (owner decisions F-1 to F-26):

- Image branding on the sign-in page and in emails: the logo, the sign-in background image, a branded favicon on the sign-in page, and the email logo (F-1, R-49, R-54, R-55). Reopens when a customer asks for a logo on either surface. The path is a public branding asset route, `/branding/<slot>?v=<file id>`. It reads the file id from the branding row, checks `scan_status`, and serves the bytes through `fileStorage.fetch`. Emails then use that public URL. It is a second download path, so it is recorded as a `DEC-20` amendment when it opens. `DEC-20` is not amended now. The guard is that `tenant_branding` keeps its image file id columns and the email renderer takes one typed branding object (R-59a).
- Per-request record navigation entries (F-6, R-29). Moved to Section 4, which adds a per-request navigation hook to the module contract. The guard is the one tree shape of R-29 and the rule that the Modules page category always wins for a static entry.
- Record-level category assignment through module providers (F-22, R-91a, the record cases of AC-19). Moved to Section 4 with the record entries. The guard is the Category assignment boundary in `../architecture/module-contract.md` and the transfer list of R-91a.
- The focus-mode slot (F-26, R-36). Moved to Section 4, where the solutions viewer is its first consumer. The guard is the shell slots of R-37, which a focus-mode slot joins.
- The review screens for a module that was removed and brought back (F-23, R-84b, AC-14a). Moved to Section 5 with controlled removal (bead `6nm`, `05-operations.md` R-26b). R-84a stays in this section.
- A global header search (F-20, R-40). Reopens when a person needs one search across modules. The guard is the reserved search slot in the header.
- The Tenant Settings fuzzy search and its per-field index (F-21, R-75a, the search cases of AC-19). Reopens when the number of sections makes browsing slow. The guard is the server-side permission rule of R-75a and the stable section and field ids in `configuration.fields`.
- The personal Preferences block for language and time zone (F-24, R-60, R-61, AC-7). Everyone sees the tenant language and time zone. Reopens when a customer spans time zones or ships a second language. The guard is the `user_preference` table, which R-86a still creates.
- The tenant text color for light surfaces (consistency check C-2, R-14). `tenant_branding.text_color` does not fill `--foreground`, which stays fixed in both themes. Reopens with the Typography tab and R-48. The guard is the `text_color` column, which stays, and the one `brandingTokens` emitter.
- The font families `ibm-plex-sans`, `manrope`, and `source-serif-4` (F-25, R-11). Reopen with the Typography tab, each by a pull request that adds its font files. The guard is the `--font-sans` per-request seam of R-10 and the approved-list constant.
- The contrast auto-fix that moves lightness and then saturation (F-26, R-46). Reopens when administrators cannot find a passing color without help. The guard is the contrast function the pills already use.
- The separate design review and manual accessibility review records per design round (F-26, R-63, R-71, AC-8). Replaced by the per-ticket checks of R-63. Reopens if a built screen drifts from its design despite those checks.

Assumptions

- Documentation checked with Context7 on 2026-09-18, and the claims below rest on it. Base UI ships as `@base-ui/react` and the old `@base-ui-components/react` scope is replaced, which matches `../core/tech-stack.md`, "Web application". Select, Dialog, Switch, Tabs, and Field are present with the anatomies the primitives need. If the package name moves again the primitives change their import and nothing else.
- Tailwind 4 carries a runtime value into a utility through a theme variable declared with `@theme inline` over a CSS custom property set on the document root. This is the mechanism R-12 and R-13 rely on. Verified against the Tailwind documentation. If the directive changes, the token layer changes in one file in `packages/config` and `packages/ui`.
- R-16/R-17 retain request-bound branding and the pre-hydration theme behavior. The accepted minimal CSP does not require nonce-bearing style elements or scripts. Verify branding styles, theme initialization and hydration in the built app; removing nonces does not relax tenant-isolated rendering or caching.
- next-intl supports an App Router setup with no locale routing by returning a locale from `getRequestConfig` and rendering `NextIntlClientProvider` in the root layout. Verified. This is what `DEC-13` needs, since Genie Ops Center has one public URL per deployment and no locale segment.
- React Email renders an HTML string and a plain-text alternative from the same component tree. Verified. R-56 depends on it.
- axe-core exposes `withTags` and `analyze` through the Playwright integration, and the WCAG 2.1 AA tag set is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. Verified against the axe-core documentation. The Playwright package version itself was not pinned in this review.
- TanStack Form accepts a zod schema directly in its validators through Standard Schema, with no adapter package, and a Standard Schema validator changes the error map shape to a record keyed by field. Verified. R-77 and R-80 depend on it.
- zod 4 exposes `z.toJSONSchema(schema, options)` and throws on an unrepresentable type unless configured otherwise. Verified. R-75 depends on it, and the five-kind restriction of `DEC-28` keeps every module schema representable, so the contract test of R-76 can assert a clean conversion.
- Not verified in this round: the exact `@axe-core/playwright` release, the shadcn command line's current support for a Base UI registry, and the Vitest browser-mode provider. Each is a Section 0 tooling choice rather than a Section 3 behavior. The spike of R-19b settles the shadcn and Base UI setup and records it in `../core/tech-stack.md`.
- No contradiction with `../core/tech-stack.md` was found in the checks above. Every verified fact matches what that file already states.
- The three drifts this draft first reported are fixed in their own documents and are no longer open. `../core/roadmap.md`, "Order and parallelism", now names item 11 among the dependent items. `../core/roadmap.md`, Section 3 item 4, now says the security headers of Section 0 item 11 are asserted on the workspace shell. `../design/design-system/tokens.md`, "Type scale", now names Plus Jakarta Sans as the default of the tenant font family key rather than as a fixed family.
- `BrandingImage.width` and `BrandingImage.height` in `../design/sections/branding/types.ts` are read from the stored bytes at read time. No column is added to `file`, which keeps that table free of image-specific columns (`../architecture/data-shape.md`, "Files"). If reading at request time proves costly, the fix is two nullable columns and nothing else changes.
- Settled 2026-10-22 (owner, spec 03 critique F-13): the audit action strings are fixed by R-90a and follow the `core:<object>_<verb>` form of `AUDIT_ACTIONS`.
- The design's email gallery is a design artifact and a development preview through the React Email preview tool, not a shipped admin screen. `../core/roadmap.md`, Section 3 item 6, asks only that the templates read branding. Decided by the product owner on 2026-09-18 and recorded at the top of `../design/sections/email-templates/spec.md`.
- The reference components under `../design/reference/` are read for intent only and are not ported. Their imports do not resolve and their class names are a sketch (`../design/reference/README.md`, rules 2 and 4).
- The branding preview renders the draft in the browser from the same components the shell and the email use, so no server round trip is needed per keystroke. The design shows a preview, not a mechanism.
- Item 6 runs beside Section 2 in the roadmap order, but the sign-in page itself is a Section 2 screen. The assumption is that Section 3 delivers the branding read and the templates during that window and that the sign-in page picks the read up when Section 2 builds it. If the two sections land out of step, item 6 slips behind Section 2 item 1 and nothing else changes.

Open questions

- Decided by the product owner on 2026-09-18 and no longer open: the email gallery is a development preview only.
- Decided by the product owner on 2026-09-18 and no longer open: the realm's local-account capability is `tenant_settings.realm_supports_local_accounts`, written by the realm step of `genie-ops setup` (R-74, `DEC-36` amended).
- Finding, `AccountUser.identitySource`, `AccountUser.lastSyncedAt`, and `TenantSupport.grantedBy`. `../design/sections/account-and-inbox/types.ts` declares all three and no column in `../architecture/data-shape.md` holds them. All three belong to the Section 2 account page, not to the Preferences block, which is deferred (R-60). The coordinator must reconcile them with Section 2.

## Revision of 2026-10-22

This appendix records the owner decisions on the spec 03 critique and the fixes from the consistency check that followed. Sections 4 and 5 link here for the items they received.

### Owner decisions F-1 to F-26

| Finding | Decision | Spec change |
| --- | --- | --- |
| F-1 | Text-only branding for the MVP. The sign-in page and emails show the company name as text, not the logo. Image branding on those two surfaces is deferred. | Defer the logo parts of R-54 and R-55. Narrow AC-6, AC-12 and AC-14 to text and color. Record the reopen path: a public branding asset route (`/branding/<slot>?v=<file id>`) as a DEC-20 amendment. |
| F-2 | In dark mode, brand text and the focus ring use one fixed light color from the fixed token layer. Brand fills such as buttons keep `--primary` and the stored foreground in both themes. No color is computed. | Keep R-13 as written. Rewrite R-15, R-46 and R-47 so that the dark-surface text and ring are the fixed token, not a derived brand step. |
| F-3 | Accepted. Bead `crg7` becomes the first Section 3 ticket, raised in priority. | Add an acceptance check: build the app and find a known `packages/ui` class in the emitted CSS. |
| F-4 | Accepted. | R-1 lists the exact shadcn variable set and the `@theme inline` mapping that the Section 2 classes already use. Add a check that the anti-slop browser scan is clean on all existing stories. |
| F-5 | Accepted. | When no branding row exists, emit the fixed defaults from `packages/ui`. Add a test on the not-set-up route. |
| F-6 | Record entries move to Section 4 (Solutions), which adds a per-request navigation hook to the module contract. Section 3 renders fixed module entries only. The category an administrator picks on the Modules page always wins. | Narrow R-29 to static entries. Remove `categoryId` from static entries in the contract and the placeholder module. Add the per-request hook to the Section 4 scope. |
| F-7 | Accepted. | R-59 and AC-6 say five templates (Spec 02 R-40a dropped the local-account invitation). Add a requirement that the renderer takes a typed branding object from the branding reader, text and color only (F-1). |
| F-9 | Accepted. | R-8: the focus ring constant uses `--ring` mapped to `--primary`, and the fixed dark-surface color of F-2 in dark mode. |
| F-10 | Accepted. | R-17 names `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))` and puts the attribute on `<html>`. |
| F-11 | Accepted. | R-30 and R-33 extend `SessionActivity`, `landingRoute` and `permittedNavigation` instead of building second copies. Update the status line. |
| F-8 | Item 3 replaces the Section 2 core kit. | Add to item 3: build the shadcn on Base UI primitives in `packages/ui`, switch People, Groups and Roles to them, delete `packages/core/src/features/admin/ui.tsx`, and add a lint check that refuses a second `ConfirmDialog` or `focusRing`. |
| F-13 | Accepted. | Name the audit keys in the spec (for example `core:branding_published`, `core:settings_updated`, `core:module_enabled`, `core:module_disabled`, `core:category_created`) and add them to the catalogue. The page caller writes the one `core:` row, and the procedure writes none. |
| F-14 | Accepted. | Use `configuration.schema` in R-75 to R-78 and AC-10. Core converts the schema and merges the field metadata. `ConfigForm` takes plain JSON Schema and metadata props. |
| F-15 | Accepted. | Declare a branding image allow-list (png, svg, webp, ico) with a small size cap. Branding images use the `postgres` adapter until the `s3` adapter arrives in Section 6, then move with `genie-ops files migrate` (`DEC-20`). |
| F-16 | Accepted. | R-86a sets orphan `category_id` values to null in the same migration before the foreign key. AC-11a asserts it. |
| F-17 | Accepted. | AC-2 tests a pure `brandingTokens(branding)` emitter in unit and integration tests, and proves the real document in an end-to-end test. |
| F-19 | Accepted. | The first primitives ticket is a short spike that sets up shadcn on Base UI. Its result goes into `docs/core/tech-stack.md`. |
| F-20 | Reserve space only. | R-40: the header layout keeps a slot for search, but Section 3 ships no search box. Modules ship their own search pages. A global header search reopens later. |
| F-21 | Defer the Tenant Settings fuzzy search. Keep the page and its section navigation. | Move R-75a and the search cases of AC-19 to Deferred. Reopen when the number of sections makes browsing slow. The server-side permission rules for reads and saves stay. |
| F-22 | Record-level category assignment moves to Section 4, with the record entries of F-6. Section 3 keeps category create, rename, reorder and delete, and whole-module placement. | Narrow R-91a to whole modules. Move the record and provider parts of R-91a and AC-19 to the Section 4 scope. |
| F-23 | Keep R-84a: a new module arrives disabled, and the administrator configures and enables it. Defer R-84b: the review screens for a module that was removed and brought back. | Move R-84b and AC-14a to Section 5, with controlled removal (bead `6nm`). |
| F-24 (and F-12) | Defer all of item 7, the personal Preferences block. Everyone sees the tenant language and time zone, as pages do today. F-12 needs no change. | Move R-60, R-61 and the item 7 acceptance criteria to Deferred. Reopen when a customer spans time zones or ships a second language. The `user_preference` table stays as the seam. |
| F-25 (and F-18) | Ship only the default face (`plus-jakarta-sans`) and the fixed mono face. The approved list holds the default key only. The other three families return with the Typography tab. | R-11: one key until the Typography tab reopens. R-10 states the mechanism: `@font-face` rules shipped from `packages/ui` through a CSS export, the default face preloaded, and `--font-sans` kept as the per-request seam. |
| F-26 | All four trims, decided by the agent at the owner's request. | Drop the separate review records of R-63, R-71 and AC-8. Each ticket's definition of done instead requires the Storybook story to match the design, a clean anti-slop scan and a passing axe check (R-66 stays). R-46 keeps the contrast pills and the publish block, without the auto-fix button. R-36, the focus-mode slot, moves to Section 4. AC-4a shrinks to AC-4 plus one assertion that the branding styles render under the security policy. |

### Consistency check C-1 to C-13

- C-1. AC-11 splits the audit assertion. A page change writes one `core:` row. A command run writes one `ops:` row and no `core:` row.
- C-2. The tenant light-surface text color is deferred with the Typography tab. R-14 fixes the font family to the default face. `--foreground` stays fixed, and R-1 is unchanged. `../design/design-system/tokens.md` and AC-2 follow.
- C-3. R-62 is met by Spec 02 R-66. It needs no Section 3 work and returns with item 7.
- C-4. AC-3, AC-4, AC-5, AC-10, AC-11, and AC-19 name their requirements by id. No AC claims a deferred or moved requirement.
- C-5. AC-3 checks that the spike of R-19b closes first and is recorded.
- C-6. AC-11b proves the first enable of R-84a.
- C-7. AC-5 proves the upload policy of R-49: formats, size limit, SVG sanitizing, scan status, and the `postgres` adapter.
- C-8. AC-3 checks classes from all three sources, the shared parts of R-25, and the migrated Section 2 screens.
- C-9. AC-1 and AC-2 prove the font mechanism of R-10 and the one-key list of R-11.
- C-10. AC-4 checks the removed `categoryId`, the reused Section 2 seams, and the empty search slot.
- C-11. AC-4 adds a shell composition test outside `apps/genie`. AC-19a checks R-41, R-94, and R-95.
- C-12. AC-10 checks the idle minutes limits, the disabled Local accounts switch, and the R-80 validation rules.
- C-13. This appendix replaces the unresolved path to the decision record. Sections 4 and 5 link here.
