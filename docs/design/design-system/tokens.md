# Design System Tokens and Recipes

This file is the fixed token layer. The tenant's one brand color and its approved font list live in `../../architecture/data-shape.md` under `tenant_branding` (`DEC-47`). Every section spec refers here for the values it uses. Implementation lives in `packages/ui` once code exists.

## Type scale

Plus Jakarta Sans, the default of the tenant font family key in `tenant_branding` (`DEC-47`), for everything, JetBrains Mono for identifiers (hex values, permission keys, ids, chips such as THIS DEVICE). Both faces are self-hosted in the image, never loaded from a third-party font service, because a regulated customer can refuse an outbound request from the sign-in page. Subset to latin and latin-ext, `font-display: swap`, and preload the one weight the sign-in page paints first. Only these two faces ship for now. The other keys of the approved list (IBM Plex Sans, Manrope, Source Serif 4) return with the Branding Typography tab (owner decision 2026-10-22). `packages/ui` ships the `@font-face` rules and the files through a CSS export, preloads only the default face, and keeps `--font-sans` as the per-request seam for the tenant font key. The scale is the Tailwind type utilities and nothing else:

| Role | Class | Weight |
|---|---|---|
| Display | `text-2xl` | bold |
| Title (page title, dialog title) | `text-xl` | bold |
| Heading (card, section) | `text-lg` | semibold |
| Body | `text-base` | regular |
| Secondary (nav rows, menu items, helper text) | `text-sm` | regular or medium |
| Caption (labels, pills, chips, counts) | `text-xs` | medium or semibold |

The smallest text size is 12 px. `text-xs` is `max(12px, 0.8rem)` with a 4/3 line height: 12 px on the 15 px default root and on the 14 px Compact root, and 12.8 px on the 16 px Large root. No class renders text below it.

On phones display and title step down one size (`text-xl lg:text-2xl`, `text-lg lg:text-xl`). Arbitrary pixel sizes (`text-[13.5px]`, `text-[11px]`, any `text-[Npx]`) are forbidden in every component; `grep -rn "text-\[[0-9.]*px\]" src` must return nothing.

The tenant font size preset (set by the branding seed until the Branding Typography tab reopens) sets the root font size to 14, 15, or 16 px. The type scale above is rem-based, so every text size follows the root without per-component changes. Control heights do not follow it: the values in the next section are fixed pixels at every preset, so a touch target keeps its size when a tenant picks Compact. `--foreground` is fixed in both themes: gray-900 in light and gray-100 in dark. A tenant text color for light surfaces is deferred with the Typography tab (owner decision 2026-10-22).

## Control heights

One scale: sm 32px (`h-8`), md 40px (`h-10`), lg 44px (`h-11`); no other height class on a control. Every row that mixes controls (search, select, segmented, button) renders all of them at md. Icon-only buttons are 40px square (md) or 32px (sm) in dense toolbars. Touch targets are at least 44 by 44 px; a 32px control gets invisible padding to reach it.

A control that grows with `flex-1` also carries its height as a minimum, `h-10 min-h-10`. A toolbar that stacks into a column under `sm` turns `flex-1` into a height rule, and a control with only `h-10` collapses to its content, which measured 22px on a phone. The pair keeps the control at md in a row and in a column.

A search field that grows with `flex-1` also carries a width floor of 192px (`min-w-48`) and a cap of 384px (`sm:max-w-sm`). It is the only flexible control in a toolbar, so without the floor every select beside it takes its intrinsic width first and the field absorbs the whole shortfall. Measured on the Solutions admin toolbar before the floor: four selects claimed about 625px of a 960px content column and the field fell to about 110px, narrow enough to cut its own placeholder. With the floor the field wraps to its own line instead of shrinking to nothing.

## Nesting of bounded surfaces

A card, a dialog, a sheet, and a slide-over are the one frame their content gets. Inside that frame, groups are separated by space and by hairline rules, never by a second bordered box. A border inside a frame is earned only when it carries something the frame cannot: a different background the content must be read against (a color specimen, a code block, a preview of another screen), a scroll boundary, a semantic tone (warning, danger, informational notice), or the boundary of a control (input, select, segmented track, drop target). Everything else is space.

This rule reaches list markup too. A list inside a frame takes `divide-y` and no border, and its rows align to the frame's own gutter rather than inset from a border of their own. A repeated bordered row inside a card is a card inside a card and is always wrong.

A preview that shows another screen fills its card edge to edge. The card border is the preview's frame, the preview draws no frame of its own, and the card takes `overflow-hidden` so the preview's square corners stay inside the card's radius.

## Radius, spacing, elevation, motion

Radius: menus 6px (`rounded-md`), controls, navigation rows, and informational or warning callouts 8px (`rounded-lg`), cards, dialogs, sheets, and the sidebar panel 12px (`rounded-xl`), pills full. The tenant letter tile is 6px small and 8px medium. A badge, a chip, a switch track, and an avatar keep their full radius, because none of them is a rectangular control. A sheet rounds only the corners it exposes: a phone bottom sheet rounds its top, an inset slide-over rounds all four. Reduced on 2026-09-18 from menus 8px, controls 12px, cards 16px; spacing, type, control heights, hit areas, colors, and behavior did not change. Page gutters are `px-4 md:px-6 lg:px-8`. Every `transition-*` and `animate-*` utility is written under `motion-safe:` (or paired with a `motion-reduce:` reset). Spacing: 4px base; page gutter 16px on phones, 24px on tablets, 32px on desktop; card padding 20px, 24px on desktop. Elevation: hairline borders (gray-200, gray-800 in dark) over shadows; only dialogs, sheets, and menus carry a shadow. A resting surface takes a hairline or a ring, never a shadow, and that includes a filled button: primary and danger carry their fill and no shadow of any color. `grep -rn "shadow-sm" src/sections src/shell` must return nothing. Motion: 150 to 220 ms, ease-out, no bounce and no scale; everything collapses to no motion under `prefers-reduced-motion`.

## Focus ring

2px solid ring with a 2px offset on every focusable control, including icon buttons, links, menu items, and close controls. Never `outline: none` without the ring. One exception: after a client navigation, core moves focus to the new page's `h1` (or its `main`) with `tabindex="-1"` so that a screen reader reads it. That element is not a control, so it draws no ring, and the token layer sets `outline: none` on a focused `h1` or `main` with `tabindex="-1"` only. The ring is opaque because it is the keyboard focus indicator and must hold 3:1 against the surface behind it (WCAG 2.1 AA, 1.4.11). At 60% opacity it measured 2.11:1 on white and 2.06:1 on gray-50 and failed.

The ring color is the `--ring` variable (owner decision 2026-10-22). In the light theme `--ring` is `var(--primary)`, so the tenant color fills it and the Branding contrast check covers the ring pair at 3:1 against white and gray-50. The default blue-600 measures 5.17:1 on white. In the dark theme `--ring` is the fixed `--brand-on-dark`, blue-400, which measures 7.92:1 on gray-950. It is never derived from the tenant color.

One shared constant, `focusRing`, holds the exact class string. In this design tree it lives in `src/shell/components/helpers.ts` (import from `@/shell/components/helpers`). The tree has no `--ring` variable, so its copy still writes blue-500 and blue-400 literally. The export step moves it to `packages/ui` in the platform repository, where every primitive lives, as this string:

`outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`

The string names no color, so it needs no `dark:` variant. Every interactive element appends it; no component writes its own ring classes.

## Color roles

The tenant primary color fills solid surfaces and the focus ring, and nothing else. Those are the primary button and the count pill (`bg-blue-600`), the active navigation row's text and icon and the tenant letter tile (`text-blue-700`, `text-blue-600`), and the ring (`ring-blue-500`). In this tree `blue-600` is the default value of the shadcn `--primary` variable, which Branding fills per request, and the export maps those classes to `bg-primary`, `text-primary`, `text-primary-foreground`, and `ring-ring`. A tinted surface that stands for identity or a label stays a fixed neutral gray: the avatar and monogram tile, every label pill, and the chrome pills (Admin portal, Administrator). So no tint ramp is derived from the tenant color, and `packages/ui` needs no color-space computation and no per-step contrast check. A tint that carries state or meaning keeps its blue and is not brand: a selected or focused table row, and an informational notice block. The test is whether the tenant's color would be wrong there. Only `--primary` and `--primary-foreground` are computed. A hover or active state is the same color at reduced opacity, `bg-primary/94` on hover and `bg-primary/80` on press, never a derived shade, which is what keeps the no-ramp rule true for buttons. Pills and semantic tones keep their Tailwind values.

Dark theme brand text and ring, one fixed token (owner decision 2026-10-22). In the dark theme the brand as text or icon and the focus ring use one fixed light color, `--brand-on-dark`, blue-400 (#60a5fa). It is not derived from the tenant color, and nothing computes it. Blue-600 as text fails in dark: it measures 3.90:1 on gray-950, below AA at `text-sm`. Blue-400 measures 7.92:1 on gray-950 and 6.98:1 on gray-900. A component that shows brand text writes `text-primary dark:text-brand-on-dark`. A solid brand fill keeps `--primary` with the stored `--primary-foreground` in both themes, blue-600 with white text by default. Blue is the only action and information color in the samples. Status is semantic: emerald success, red danger, amber warning, gray neutral. Text never lighter than gray-500 (gray-400 in dark). Dark theme mirrors: gray-100 body, gray-300 secondary, gray-400 labels, surfaces gray-950 and gray-900.

The export carries these roles as the shadcn variables the platform code already uses (owner decision 2026-10-22). Only `--primary` and `--primary-foreground` are tenant colors. Every other value is fixed, `--foreground` included. A tenant text color for light surfaces returns with the Typography tab.

| Variable | Light | Dark |
|---|---|---|
| `--background` | white | gray-950 |
| `--foreground` | gray-900 | gray-100 |
| `--card` | white | gray-900 |
| `--muted` | gray-50 | gray-900 |
| `--muted-foreground` | gray-600 | gray-400 |
| `--border` | gray-200 | gray-800 |
| `--input` | gray-500 | gray-500 |
| `--ring` | `var(--primary)` | `var(--brand-on-dark)` |
| `--primary` | tenant color, default blue-600 | same as light |
| `--primary-foreground` | stored tenant foreground, default white | same as light |
| `--destructive` | red-600 | red-600 |
| `--destructive-on-dark` | red-400 | red-400 (#f87171): 7.28:1 on gray-950, 6.41:1 on gray-900 |
| `--brand-on-dark` | blue-400 | blue-400 |

The app stylesheet maps each variable to a Tailwind color of the same name in `@theme inline`, for example `--color-primary: var(--primary)`. That is what makes `bg-primary`, `ring-ring`, `border-input`, and `text-muted-foreground` resolve. `--brand-on-dark` is read only under the dark variant.

Dark theme error text, one fixed token (2026-10-28, `6wz1.71`). Red-600 as text fails in dark: it measures 4.17:1 on gray-950 and 3.67:1 on gray-900, below AA at `text-sm`. In the dark theme, error text and error icons use `--destructive-on-dark`, red-400, which measures 7.28:1 on gray-950 and 6.41:1 on gray-900. A component that shows error text writes `text-destructive dark:text-destructive-on-dark`, in the same pattern as the brand text. `--destructive` stays red-600 for the solid danger button in both themes, with white text. Like `--brand-on-dark`, the token is fixed and is read only under the dark variant.

The theme is a `data-theme` attribute on `<html>`. The server writes it from the organization's default theme, and the client corrects it before paint when that default is `system`. The app stylesheet declares `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`, so every `dark:` class follows the attribute and not the operating system setting. Theme belongs to the organization, and a person has no theme preference (owner decision 2026-10-19).

## Pills and chips

- Status pill: tinted background, semibold small text. Active or Ready or Entitled emerald; Pending or Draft or Not entitled gray; Disabled or Down red; Maintenance or Stale amber.
- Label pill: gray or blue, never a status color. Used for Admin portal, Notice, counts, type labels (Chat, Embedded), kind (System, Custom), source (Directory, Local).
- Mono chip: `MonoChip` from `@/shell/components/MonoChip` in this tree, `packages/ui` after export. JetBrains Mono (`font-mono`), `text-xs` medium, uppercase, `tracking-wide`, gray-100 background and gray-700 text (dark: gray-800 and gray-300), full radius. For THIS DEVICE, WORKSPACE MEMBER, ADMINISTRATOR. Never a status or blue color.
- Count pill: the brand fill, `bg-primary` with `text-primary-foreground` (blue-600 and white by default), in navigation for unread and grouped counts.

## Tables and card lists

Header row small semibold gray-600 on gray-50; body rows body size with 12px vertical padding on desktop, 16px on phones; hover gray-50; hairline row dividers. In the dark theme the body rows sit on the page color (`--background`, gray-950) and the header row is the lighter `--muted` band (gray-900) (owner, 2026-10-27, L273). A clickable row opens from a button in its identity cell. That button is reachable by keyboard and takes the shared focus ring, so the row itself carries no `tabindex` and no `role` (amended 2026-10-25, S3-03 plan decision PD-5). A row that holds its own buttons keeps them in the tab order after the row itself. Under 768px every table becomes a card list: one card per row with identity, status pill, and one or two scan facts, actions in an overflow menu. No horizontal scrolling.

## Category colors

An event-category chip in a table or a list may carry a fixed color, under the exception to the State-vs-Label Rule in `DESIGN.md` (owner, 2026-10-27). The category comes from the action key of the audit event, so a reader scans a long log by domain. Every value is fixed: none derives from the tenant color, and none matches a status color or the default `--primary` blue. The chip keeps its text label, so color is never the only code, and avatars stay neutral gray. An operator row (`ops:*`) carries no category and keeps the neutral chip.

| Category | Action keys | Light chip | Light text | Dark chip | Dark text | Text contrast, light / dark |
| --- | --- | --- | --- | --- | --- | --- |
| Sign-in and sessions | `auth:*` | `#ecfeff` | `#155e75` | `#083344` | `#67e8f9` | 6.99 / 9.24 |
| People | `core:person_*`, `core:invitation_sent`, `core:set_password_sent` | `#f5f3ff` | `#6d28d9` | `#2e1065` | `#c4b5fd` | 6.48 / 8.25 |
| Groups | `core:*group*` | `#fdf4ff` | `#a21caf` | `#4a044e` | `#f0abfc` | 5.89 / 8.41 |
| Roles and access | `core:role_*`, `core:permission_transformation` | `#eef2ff` | `#4338ca` | `#1e1b4b` | `#a5b4fc` | 7.07 / 8.02 |
| Branding and settings | `core:branding_published`, `core:settings_updated` | `#faf5ff` | `#7e22ce` | `#3b0764` | `#d8b4fe` | 6.51 / 8.48 |
| Modules | `core:module_*`, `core:category_*` | `#f0f9ff` | `#0369a1` | `#082f49` | `#7dd3fc` | 5.57 / 8.32 |
| Module events | any other prefix, for example `solutions:*` | `#f1f5f9` | `#334155` | `#1e293b` | `#cbd5e1` | 9.45 / 9.85 |

Every chip text pair holds at least 4.5:1 against its own fill in both themes. Each text color also sits at least 10 OKLab units from the success, warning and danger colors and from the default primary blue, so no category reads as a status. The values live in the fixed token layer as `--category-<name>-bg` and `--category-<name>-fg`, and a test holds both rules.

## Breadcrumbs

`PageHeader` carries a breadcrumb slot above the page title (owner, 2026-10-27). The trail shows only on a page that sits under a list, for example "Roles › Tenant administrator". A top-level page never shows one. The last crumb is the record label, it is not a link, and it truncates with its full text in `title`. Under 768 px the trail collapses to one back link to the parent, for example "‹ Roles", at least 44 px tall. Core builds the trail from the route parent and the record label, so a module page gets it with no code of its own. The slot uses the shadcn Breadcrumb in the base style, and each link takes the shared focus ring.

## Transfer list

One pattern, two forms. Both move rows between two buckets, both search each bucket, both count it, and both move every ticked row in one press. Use a transfer list when both sides can pass about twenty rows and both directions are editable in bulk. A short list keeps the plain picker. A list of permission keys grouped by module keeps the checkbox tree. The pattern comes from the v1 admin portal, where it edits group membership and solution grants.

Two-pane form, for a container of about 900 px or wider, for example a page. The catalogue is on the left and what is granted is on the right. Each side carries a heading with a count, a select-all box, a search field over the label and the secondary line, a quick action for everything shown ("Add all shown", "Remove all shown"), and a footer button that appears only when a row is ticked ("Add 3", "Remove 2"). The left footer button is primary and the right one is secondary with red text, because removal is the destructive direction. A row whose change is not saved carries a Pending pill.

Roster form, for a narrow container, for example a slide-over or a phone sheet. Two panes in 480 px halve every row and leave the lower half of the panel empty, so the roster is one list that fills the height: a search field, a select-all row, then the chosen group and the group of everything else, each under a sticky heading with its count. The footer offers the move that fits the ticks, "Add 3", "Remove 1", or both at once. A destructive group action, for example Remove all, sits at the right of its heading.

In both forms a ticked row takes the blue selected tint, because selection carries state and not identity. A row that must not move keeps its place at reduced opacity with the reason in its `title`, so the rule stays readable instead of hiding the row. Rows are at least 44 px tall.

Components in this tree: the two-pane form is `TransferList` in `src/sections/access/components/`, the roster form is `TransferList` in `src/sections/people-groups-and-roles/components/`. Both become one component with a `layout` prop in `packages/ui` after the export.

## Section navigator

For a screen that holds many independent forms, for example Tenant settings. A gray-50 panel of 232px on the left, sticky on desktop, and one section's card on the right; one column under `md`, where the panel is the first screen and the section is the next, with a text Back control at the top of the section. A row is a `rounded-lg` button at the control height, 44px under `lg`, carrying the section name, then the status marks it needs: an unsaved dot, a label pill, a warning pill. The selected row takes the active navigation treatment, a white fill with a hairline ring and blue text, and carries `aria-current`. Groups are separated by an uppercase caption, never by a rule.

The panel holds four type roles and only two sizes, so case, weight, and tone carry the rest. The group caption is `text-xs` semibold uppercase at `tracking-wider`, because capitals lose the word shape that lowercase gives and need one step more letter spacing than body text. It is gray-600 (gray-400 in dark), never gray-500: gray-500 measured 3.84:1 on the dark panel and failed 1.4.3, and it also left the caption quieter than the closing note it outranks. A section name is `font-medium`, and the selected one `font-semibold`, so a 12px state pill never outreads the 14px name it modifies. The two weights render within one pixel of each other, measured on labels of 48 to 62 px, and the name sits in a fixed box, so it does not move when the selection changes. A name that truncates carries its full text in `title`, because a truncated navigation label is otherwise unrecoverable; a 232px panel cuts at about 19 characters.

The sidebar rail of the shell is the same pattern at 240px and follows the same four roles. Every row is `font-medium`, the selected one `font-semibold`, and a category disclosure is a row like any other: its chevron, its count, and the indent of its children carry the nesting, not extra weight. The tenant name at the head of the rail and the person's name at its foot are both `text-sm` semibold, because the type scale carries no bold at 14px. A 240px rail cuts a nav label at about 26 characters, so every truncating label carries `title`.

The closing note under the groups is separated by a hairline rule, which is the one rule the panel carries, because it marks an aside and not a group boundary. Its measure is about 33 characters, below the 45-character floor for prose, and 232px cannot reach that floor at `text-xs`. Keep the note to one or two short sentences. A longer explanation belongs in a help disclosure, not in the rail.

Each section owns its Save and Discard; the screen has no global save. Every path that leaves an edited section, which is another section, a search result, and the phone Back control, passes through the confirm dialog first.

## Help disclosure

One pattern for contextual help. A labelled button opens one small callout beside the control it explains. The button carries a question-mark icon, and the label names the question, for example "How access works". The callout is collapsed by default, and no screen opens it on load.

The button is a real button. It opens on click, on tap, and on Enter or Space, and it never opens on hover alone. Escape closes it, a click outside closes it, and a Close link at the foot of the callout closes it for touch. The button carries `aria-expanded` and `aria-controls`. The panel carries `role="group"` and the same label.

The panel is 320 px wide and never wider than the viewport less 32 px. From 640 px it hangs off its button, aligned with the button's left edge, or with its right edge when the button sits at the right of a row. Under 640 px it leaves the button entirely and pins to the viewport instead: 16 px from each side edge and clear of the bottom bar, so it cannot be clipped wherever the trigger sits, which is the same rule that gives a dialog the full width under 768 px. It holds two or three short paragraphs of plain language, and the last one can carry one example drawn from the sample tenant. It holds no control other than Close.

In a toolbar the disclosure drops to its icon and sits 4 px from the right edge of the search field it follows, at 44 px square under `sm` and 40 px from `sm`. A six-word blue label inside a row of controls both steals width from the search field and reads as a second action beside the primary button. The label moves to `aria-label` and to `title`, so the name is still spoken and still reachable on hover. Outside a toolbar, for example under a card's guidance line or beside a settings field, the disclosure keeps its written label.

## What helper text stays visible

Keep the screen as clean as possible, but never hide what a person must always be reminded of. This rule decides, on every screen, which text stays visible and which moves into the screen's Help disclosure.

| Stays visible | Moves into the Help disclosure |
| --- | --- |
| What the person must do to finish the current step, for example the password rules while they type | How a feature works, and background, for example where names and groups come from |
| Errors, warnings and the current state, for example "Changes stay in this browser until you publish" | Why a rule exists, and policy explanations |
| The consequence of a destructive or irreversible action, in its confirm dialog | Tips, examples, and what counts mean |
| Security and compliance notices, for example the system-use notice or "It never grants access" | Long descriptions under a page title: one short subtitle line stays, the rest moves |

Text that repeats something already on the screen is removed, not moved. Example: a strength bar that repeats a password checklist goes.

## Rendered prose (Typeset)

Markdown that the product renders as reading text, for example the prose of an agent answer, is styled by the shadcn Typeset file (`typeset.css`, owned in the app stylesheet folder) with one preset, `typeset-chat`. The preset uses the body font, size and line height of this type scale, so prose and interface text match. Interface text (labels, tables, forms, page headers) never uses Typeset. A component placed inside prose, for example a chart or a records table, carries `not-typeset` and keeps its own design.

## Filter disclosure

When a list carries more than two narrowing controls, they sit behind one Filters button and not in the toolbar row. The button is the secondary button with a sliders icon, and it carries a blue count pill of the filters now narrowing the list. Its panel is 288 px wide, hangs from the left edge of the button, and stacks one labelled control per filter with a Clear filters control at the foot when the count is above zero.

Sort never goes in the panel. Sort orders the list and never removes a row, so it stays in the toolbar beside the Filters button.

The panel holds no hidden state. Every active filter renders as a removable chip on its own row under the toolbar, with a Clear all control beside the chips, and the empty result carries a Clear filters control. A person reading the page must be able to see why a row is missing without opening anything.

Screens using it: the Solutions admin table (Type, Status, Category, Show archived), the Audit log (Actor, Action, Target, Date range), and the People directory (Status, Group). Groups and Roles carry one narrowing control or none and keep it in the row.

Use it where a concept needs an explanation, at most one per screen: additive grants and scopes in Access, membership-derived access against direct exceptions in People and Groups, permission bundles in Roles, the deployed image and the read-only Access column on Modules, the module-only count on Categories, the unlinked target and the anonymized actor in the Audit log, Pending against Disabled against Removed on People, directory groups against local groups on Groups, what a solution status shows members, how a chat theme reaches a solution, and the browser-side draft behind Publish in Branding. A consequence that changes what a press does belongs in the confirmation or in the result, never only here. Repeated banners, instructional cards, and debug panels stay out. A screen whose own copy already explains the concept takes none: Role detail states entitlement twice in place, so it carries no disclosure.

Components in this tree: `HelpNote` in `src/sections/access/components/ui.tsx`, `src/sections/people-groups-and-roles/components/ui.tsx`, `src/sections/audit-and-tenant-settings/components/ui.tsx`, `src/sections/solutions/components/ui.tsx`, and `src/sections/branding/components/ui.tsx`. The five are identical and become one component in `packages/ui` after the export. The audit that placed them is `../help-disclosure-audit-2026-09-19.md`.

## Buttons

Variants: primary (brand fill, `--primary-foreground` text), secondary (white fill, a border from the `--input` token that meets the 3:1 boundary of WCAG 1.4.11, gray-800 text; amended 2026-10-25, S3-03 plan decision PD-11), danger (red-600 fill, white text), ghost (no fill, no border, gray-700 text), and icon-only, which is a square of the same height with an `aria-label`. No variant carries a resting shadow; the fill and the hairline do the work.

A switch is a visually hidden input under a drawn track, so the track is only pressable inside a label. Either use the labelled switch row, or wrap the bare switch in a label of its own. Sizes follow the control scale: sm 32px, md 40px, lg 44px, md being the default.

States, the same four for every variant. Hover: a fill variant drops to 94% opacity, an outline or ghost variant takes a gray-50 fill. 94% is the lowest whole opacity that keeps both default fills at 4.5:1 against white text on the white page: primary blue-600 measures 4.66:1 and danger red-600 4.54:1. At 90% they measured 4.34:1 and 4.32:1 (bead `6wz1.87`, 2026-10-29). In the dark theme the fill darkens over the page, so the ratio rises: 5.66:1 and 5.34:1 on gray-950. Active: 80% opacity. Disabled: 50% opacity, `cursor-not-allowed`, no hover change, and `aria-disabled` rather than the `disabled` attribute when the control must stay focusable to explain why. Loading: the label stays, a spinner replaces the leading icon, the control keeps its width, `aria-busy="true"`, and a second press does nothing. Use the loading state for any action that leaves the page or waits on the network, which is at least Publish, Save, Send test, and the sign-in redirect.

## Forms and feedback

Every control carries its own accessible name. A label that wraps its control names it; a label drawn as a sibling does not, so that control takes an `aria-label` with the same words. A field that holds two controls, for example a color picker beside its hex value, names each one.

Warning note: the one amber block, `WarningNote` in this tree. Amber-800 on amber-50 (amber-200 on amber-900/30 in dark), one alert icon, `rounded-lg`, the control radius. `sm` is the inline note under a control (`text-xs`, 10px by 6px padding); `md` is the block at the top of a card or a sheet (`text-sm`, 14px by 12px padding). It carries `role="status"` when it explains a state and nothing when it is static prose. Amber is only ever a real warning.

Label above the control, helper text below in small gray-600, field error below in small red-700 (`--destructive-on-dark` in dark) with `aria-describedby`. An input border is gray-500, which measures 4.89:1 on white, because the border is the boundary of a component and 1.4.11 asks for 3:1. The hairline gray-200 elsewhere stays, because a row divider or a card edge is decoration and the rule does not reach it. Form-level error block with `role="alert"`; informational notice block with `role="status"`. A changed field carries a small blue dot on its label while unsaved. Required fields are marked in the label.

## Drop zone

One pattern for every drop target, for example the Branding image slots (owner, 2026-10-27). The zone must read as a drop target in light and in dark, with no new hue and no tint ramp.

- Idle: a 2 px dashed border in `--input`, a quiet `--muted` fill, and a minimum height of about 120 px. The upload icon sits in a neutral gray tile and is larger than a text icon. The action line comes first and is stronger, "Drop an image or browse". The limits and the scan line sit below it in muted text.
- Hover and keyboard focus: the shared focus ring.
- Drag-over: the border turns solid `--primary` (`--brand-on-dark` in dark), the fill turns the blue informational tint, and the action line changes to "Drop to upload". The tint carries state, so it stays blue and is not brand.
- Refused file: the destructive state, with the reason as error text.

## Overlays

Dialog: 480px wide (`max-w-[480px]`) and centered on desktop; under 768px full width and anchored to the bottom with a bottom action bar; dimmed scrim, focus trapped, Escape closes unless the spec says otherwise. This applies to every dialog, the idle-timeout countdown included: it is 480px on desktop and full width with a bottom action bar on phones, never a narrower centered card. Confirm dialog: title names the object ("Remove Alex Morgan?"), one sentence of consequence, Cancel as the default focused button, the action button in the danger tone for destructive actions and primary otherwise; closing by Escape, scrim, or Cancel is a cancel. Confirm dialog API: `ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose })`, built on the shared `Dialog`, Cancel focused by default; every destructive path in every section uses it. Slide-over: 480px (people, groups) or 560px (configure solution) on desktop, a right sheet on tablets, a full-height sheet on phones. Menu: 6px radius (`rounded-md`), shadow, keyboard navigable.

Focus containment is part of every modal, not a later addition: focus moves into the panel on open, Tab and Shift+Tab cycle inside it, the page behind it does not scroll, the scrim stays out of the tab order, and focus returns to the control that opened it on close. In this design tree one hook, `useModalFocus`, sits in each section's `components/helpers.ts` and carries all of it; the five copies become one primitive in `packages/ui` after the export, built on the approved Base UI dialog. `aria-modal` and a visible focus ring are labels for that behavior, never a substitute for it.

Overlays nest, so ownership is explicit. Only the innermost open overlay answers Escape and Tab. One Escape closes the confirm dialog and leaves the sheet that raised it open, with focus back on the control inside that sheet, and the next Escape closes the sheet. Stopping the scroll means two things and only two: a person cannot scroll the background, and focus cannot leave the panel. Scrolling inside the panel keeps working, because a long sheet that cannot be read is worse than a page that moves behind it. Stop the element that actually scrolls: the shell scrolls in its own container, not in `body`, so the outermost overlay hides the overflow of `body` and of every scrolling ancestor of its panel, and the last overlay to close gives them back.

Hiding the overflow is the whole mechanism. Do not add scroll-position freezing on top of it: no rewriting `scrollTop` on an event, no `position: fixed` on the body with a restored offset. Hiding the overflow stops a person, which is the requirement. It does not stop a script, and the container still moves under `element.scrollTop = n`; that is expected and is not a gap to close here.

What the design tree measures: a real wheel event over the page and a keyboard page-down, on a desktop and on a phone viewport, plus a wheel inside the open panel. What it does not measure: a touch drag, a trackpad momentum fling, a scrollbar drag, and any assistive-technology scroll. Those are unverified, not claimed. An earlier version of the check looked for any element that happened to overflow and reported no movement on a desktop viewport where nothing overflowed; every desktop result from that version is withdrawn. Reading focus when a panel opens is too late to learn which control opened it, because a panel applies its own `autoFocus` during the same commit; follow the focus while the panel is closed instead, and accept focus inside another overlay only when that overlay is the one this panel opens from.

## Toast

Bottom center on phones, bottom right on desktop; success, neutral, and error tones; auto-dismiss after 4 seconds with a manual close; at most three stacked; `role="status"`.

A failed one-click action, such as signing out a session or creating a category, shows an error toast. A failed form save shows the error inline, at the field or at the form (U-1, 2026-10-25).

## Empty state

Centered block: icon or letter tile, one heading, one sentence, at most one primary action. Filter empty states offer Clear filters.

One part, `EmptyState` in `packages/ui`, has two forms (batch 5, 2026-10-28). The framed form fills a page: a 1 px dashed `--border` frame, a 52 px neutral icon tile or the company mark tile, a 20 px semibold heading, the line and an outline button. A refused page and an empty home use it. The compact form has no frame and no tile, for a list that matches nothing. Its action is the outline button "Clear search and filters".

## Loading

Skeleton blocks match the shape they replace and animate only when motion is allowed. They fill with `--border` (gray-200, dark gray-800), because `--muted` (gray-50) does not show on a white page. A spinner carries `role="status"` and a visually hidden label.

## Icons

Lucide, 16px in text and pills, 20px in navigation and buttons, stroke 1.75. No emoji as icons.

## Live regions

Offline bar, toasts, spinners, the password strength meter, and inline send errors announce through `aria-live` or a role. Countdown text in the idle modal updates in a `role="timer"` region.
