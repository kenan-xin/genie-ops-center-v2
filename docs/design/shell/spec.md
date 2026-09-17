# Application Shell Specification

## Overview
One shell component with two chromes: the member workspace and the admin portal. Both share the same anatomy (tenant identity block, 240px sidebar, 54px header, user footer) but carry different navigation. A person never sees admin items in the workspace. A person who holds admin permissions switches chrome through the user menu. The shell reads tenant branding (logo, company name) and shows only the modules the tenant is entitled to and the person may reach. Visual language: white page, soft gray sidebar panel with rounded corners, hairline borders, rounded rows and pills, blue for actions and active states.

## Navigation Structure
- Solutions → the solutions hub, the landing route after sign-in [workspace]. The solutions module owns this page and marks its entry as the landing route; core has no landing page of its own (`DEC-49`)
- Favorites → Favorites list in Solutions [workspace]
- Inbox → Notification inbox, with a blue unread count pill on the right [workspace]. Deferred: the platform schedules the inbox screen after the core sections (`DEC-21`), so the shell hides this entry and the pill until then. The design is kept as delivered early.
- Pinned rail → Up to six favorite solutions, drag to reorder, under the workspace nav [workspace]
- Category tree → One tree: a collapsible group with a count per core category that holds at least one entry, mixing solution entries and module entries sorted by label, then an ungrouped "Other" area for entries with no category [workspace]
- People → People, Groups, and Roles [admin, Core]
- Groups → People, Groups, and Roles [admin, Core]
- Roles → People, Groups, and Roles [admin, Core]
- Branding → Branding [admin, Core]
- Audit log → Audit and Tenant Settings [admin, Core]
- Settings → Audit and Tenant Settings [admin, Core]
- Modules → Modules page: every compiled module, on or off, its category, and who reaches it (`DEC-50`) [admin, Core]
- Categories → Categories page: the headings that group solutions and modules in the sidebar (`DEC-51`) [admin, Core]
- Solutions → Solutions admin [admin, Solutions]
- Chat themes → Solutions admin [admin, Solutions]
- Access → Solutions admin, access overview [admin, Solutions]
- Administration / Back to workspace → Switch chrome, in the user menu, only for admins
- Account → Account page, in the user menu (`/account` or `/admin/account` so the chrome does not change)
- Help and support → Tenant support URL or email from Branding Links, in the user menu

Workspace sidebar, top to bottom: tenant block, WORKSPACE label, Solutions, Favorites, Inbox (hidden until the platform schedules the inbox screen, `DEC-21`), PINNED rail (at most six, drag to reorder, unchanged), divider, one category tree mixing solution and module entries, divider, the ungrouped "Other" area, user footer. The server decides what the tree shows: only entries the person may reach, and only categories that hold at least one of them. A module entry shows its icon; a solution entry shows none. Category names and "Other" entries start at the same x position, so the caret sits on the right. Admin sidebar: tenant block, ADMIN PORTAL pill, CORE group, one group per entitled module that declares admin pages, user footer. Future customer modules add one workspace entry and, if needed, one admin group.

## User Menu
Sidebar footer in both chromes. Avatar with initials fallback, display name, and a `MonoChip` role chip (WORKSPACE MEMBER, ADMINISTRATOR). Opens upward with Account, Change password (local-account tenants only, opens the realm's account page), Administration or Back to workspace (admins only), Help and support, and Sign out. Sign out ends the Genie session and the Keycloak realm session.

## Layout Pattern
Sidebar navigation. A 240px sidebar on the left with the tenant identity block at the top (tenant logo, or a letter tile fallback, plus company name and product name), the chrome marker and navigation in the middle, and the user footer pinned to the bottom. A 54px header above the content area holds the page title, derived from the active nav item, and the hamburger on small screens. The content area scrolls independently of the sidebar.

## Responsive Behavior
Mobile first: every screen, including the admin portal, is designed at phone width before any wider layout, and no action is available only on desktop.
- **Mobile (under 768px), the base design:** No sidebar. A 54px header with the tenant mark, page title, and hamburger; the hamburger opens a full-height drawer capped at 84% of the viewport width with the same navigation, closed on route change. Tables render as card lists, inspectors and dialogs render as full-height sheets, and primary actions sit in a sticky bottom bar when a page has one.
- **Tablet (768px to 1023px):** Same drawer navigation. Tables may return to rows with fewer columns; inspectors are right-hand sheets.
- **Desktop (1024px and up):** Sidebar always visible at 240px. Header shows the page title only. Inspectors are 480px slide-overs.

## User menu samples

The workspace chrome shows the administrator Priya Nair, whose menu carries Administration. `?member=1` shows the workspace member Alex Morgan, whose menu has no Administration item (DEC-23). Change password appears only for a local-account tenant, shown with `?local=1`; the brokered sample has no such link.

## Cross-cutting behaviors
- Offline indicator: on the browser `offline` event a red bar appears fixed at the top of the viewport in both chromes, full width above the sidebar and the content, and pushes everything below it down by its height (40px); it never renders as a column beside the sidebar. Copy: "You are offline. Changes will not be saved until the connection returns.", `role="status" aria-live="polite"`; it disappears on `online`. Sends in the chat viewer are disabled while offline.
- Idle timeout: pointer, keyboard, and touch activity extends the server session silently, throttled to half the idle window; the countdown modal from the Account and Inbox section appears only after real inactivity, before the server session expires.
- Theme: no toggle in the header. Theme follows the tenant default or the person's preference on the Account page.
- Collapsed categories in the sidebar persist per device (local storage), not per account.
- Drawer on phones and tablets opens over a dimmed scrim; tapping the scrim or changing route closes it.
- Viewer Focus mode: the solutions viewer can hide the sidebar and take the full width, with an Exit focus control in its header. On phones the viewer is always full width.
- Administration switch lands on People. Back to workspace lands on Solutions.
- Touch targets: under `lg` (below 1024px) every interactive row and icon button is at least 44px tall (`min-h-11 lg:min-h-0`): nav rows, pinned and category rows, user-menu items, the hamburger and drawer close buttons. On desktop nav rows are 40px and tree rows 32px.
- Loading: page skeletons for lists and detail panes, skeleton rows in tables, a spinner with `role="status"` for streaming and embedded frames. No spinner replaces a whole page.

## Design Notes
- Designed mobile first; phone layout is the base and the desktop layout adds columns. The AppShell accepts a `bottomBar` slot for a page's primary action on phones; header actions move there when no bottom bar is given.
- The Administration switch item renders only when the person holds a core admin permission. Sign out ends the Genie session and then the realm session.
- Visual language: white page with a soft gray sidebar panel with rounded corners, hairline borders, rounded-xl rows and controls, rounded-2xl cards, tinted pills for status, and blue for actions and active states. No near-black surfaces, no left rules, no sharp corners. Fonts: Plus Jakarta Sans everywhere, JetBrains Mono for identifiers such as hostnames.
- Header: page title with a one-line description on the left, search and actions on the right. Not a bar, part of the page. The search placeholder follows the chrome: "Search solutions" in the workspace, "Search people" in the admin portal (People is the admin landing page). No bell and no notification button in the header, in either chrome.
- Active nav row: white pill with a hairline ring and blue text and icon. Admin portal marker: gray-tinted pill under the tenant name.
- Color roles: the tenant primary color from Branding fills the shadcn `--primary` and `--primary-foreground` variables per request and shows only as small accents: the active nav row, primary buttons, the focus ring, and count pills. In this design tree `blue-600` stands for `--primary` (the default value); the export maps those classes to `bg-primary`, `text-primary-foreground`, and `ring-primary`. Every tinted surface stays a fixed neutral gray, the avatar background and the Admin portal pill included, so core derives no tint ramp from the tenant color and only `--primary` and `--primary-foreground` are computed. The sidebar panel and page chrome never take the tenant color. There is no secondary or accent brand color. Blue is the only action and information color in the samples. Status is semantic: emerald for success, red for danger, amber only for real warnings, gray for neutral. Pills that label a thing (Admin portal, Notice, counts) are gray or blue, never a status color.
- Text tones: body and nav rows gray-900 or gray-700, secondary text gray-600, labels and icons gray-500, never lighter than gray-500 for text. Dark theme mirrors with gray-100, gray-300, gray-400.
- Light and dark themes. The dark sidebar uses the same surface as the page background so the border, not a fill change, separates them.
- Notifications surface only through the Inbox nav item and its unread chip. No bell in the header. Until the platform ships the inbox, no notification surface is shown at all.
- Module contract (Navigation row): a module declares workspace entries and admin entries with required permission, and a navigation tree `{ pinned: Entry[] (at most six, ordered), entries: Entry[] }`, built from the records the person may reach and resolved per request after `can()`, where an entry can carry `categoryId`, the id of a core `category` row. Core groups the entries by its own `category` table, places a module's static workspace entries under `tenant_module.category_id`, renders one tree, and persists collapse state per device. A module treats a category id that no longer exists as no category, and core never reads a module table to build the tree (`DEC-51`). One workspace entry is marked the landing route, and core sends a person there after sign-in (`DEC-49`).
- A person with no solution grants sees the Solutions hub with an empty state. A person without admin permissions has no switch item in the user menu.
- Idle-timeout warning and offline indicator mount inside the shell but are not part of the navigation chrome. The AppShell exposes `focus` (hides sidebar and header for the viewer), `loading` (skeleton rows with `role="status"`), and `offline` (forces the offline bar in previews).
