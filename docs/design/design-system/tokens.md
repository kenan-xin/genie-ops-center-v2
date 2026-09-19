# Design System Tokens and Recipes

This file is the fixed token layer. The tenant's one brand color and its approved font list live in `../../architecture/data-shape.md` under `tenant_branding` (`DEC-47`). Every section spec refers here for the values it uses. Implementation lives in `packages/ui` once code exists.

## Type scale

Plus Jakarta Sans, the default of the tenant font family key in `tenant_branding` (`DEC-47`), for everything, JetBrains Mono for identifiers (hex values, permission keys, ids, chips such as THIS DEVICE). Both faces are self-hosted in the image, never loaded from a third-party font service, because a regulated customer can refuse an outbound request from the sign-in page. Subset to latin and latin-ext, `font-display: swap`, and preload the one weight the sign-in page paints first. The scale is the Tailwind type utilities and nothing else:

| Role | Class | Weight |
|---|---|---|
| Display | `text-2xl` | bold |
| Title (page title, dialog title) | `text-xl` | bold |
| Heading (card, section) | `text-lg` | semibold |
| Body | `text-base` | regular |
| Secondary (nav rows, menu items, helper text) | `text-sm` | regular or medium |
| Caption (labels, pills, chips, counts) | `text-xs` | medium or semibold |

On phones display and title step down one size (`text-xl lg:text-2xl`, `text-lg lg:text-xl`). Arbitrary pixel sizes (`text-[13.5px]`, `text-[11px]`, any `text-[Npx]`) are forbidden in every component; `grep -rn "text-\[[0-9.]*px\]" src` must return nothing.

The tenant font size preset (Branding, Typography tab) sets the root font size to 14, 15, or 16 px. The type scale above is rem-based, so every text size follows the root without per-component changes. Control heights do not follow it: the values in the next section are fixed pixels at every preset, so a touch target keeps its size when a tenant picks Compact. The tenant text color fills `--foreground` on light surfaces only; the dark theme keeps gray-100.

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

2px solid ring in blue-500 with a 2px offset on every focusable control, including icon buttons, links, menu items, and close controls. Never `outline: none` without the ring. The ring is opaque because it is the keyboard focus indicator and must hold 3:1 against the surface behind it (WCAG 2.1 AA, 1.4.11). At 60% opacity it measured 2.11:1 on white and 2.06:1 on gray-50 and failed. Solid blue-500 measures 3.68:1 on white. A tenant color fills this ring on export, so the Branding contrast check covers the ring pair at 3:1. One shared constant, `focusRing`, holds the exact class string. In this design tree it lives in `src/shell/components/helpers.ts` (import from `@/shell/components/helpers`); the export step moves it to `packages/ui` in the platform repository, where every primitive lives:

`outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950`

Every interactive element appends it; no component writes its own ring classes.

## Color roles

The tenant primary color fills solid surfaces and the focus ring, and nothing else. Those are the primary button and the count pill (`bg-blue-600`), the active navigation row's text and icon and the tenant letter tile (`text-blue-700`, `text-blue-600`), and the ring (`ring-blue-500`). In this tree `blue-600` is the default value of the shadcn `--primary` variable, which Branding fills per request, and the export maps those classes to `bg-primary`, `text-primary`, `text-primary-foreground`, and `ring-primary`. A tinted surface that stands for identity or a label stays a fixed neutral gray: the avatar and monogram tile, every label pill, and the chrome pills (Admin portal, Administrator). So no tint ramp is derived from the tenant color, and `packages/ui` needs no color-space computation and no per-step contrast check. A tint that carries state or meaning keeps its blue and is not brand: a selected or focused table row, and an informational notice block. The test is whether the tenant's color would be wrong there. Only `--primary` and `--primary-foreground` are computed. A hover or active state is the same color at reduced opacity, `bg-primary/90` on hover and `bg-primary/80` on press, never a derived shade, which is what keeps the no-ramp rule true for buttons. Pills and semantic tones keep their Tailwind values.

Dark theme primary defaults, pinned here because the tenant derivation needs a fixed starting point: the brand as text or icon is blue-400, not blue-600, because blue-600 measures 3.90:1 on gray-950 and fails AA at `text-sm` while blue-400 measures 7.92:1 on gray-950 and 6.98:1 on gray-900. The focus ring in dark is blue-400. A solid brand fill keeps blue-600 with white text. Blue is the only action and information color in the samples. Status is semantic: emerald success, red danger, amber warning, gray neutral. Text never lighter than gray-500 (gray-400 in dark). Dark theme mirrors: gray-100 body, gray-300 secondary, gray-400 labels, surfaces gray-950 and gray-900.

## Pills and chips

- Status pill: tinted background, semibold small text. Active or Ready or Entitled emerald; Pending or Draft or Not entitled gray; Disabled or Down red; Maintenance or Stale amber.
- Label pill: gray or blue, never a status color. Used for Admin portal, Notice, counts, type labels (Chat, Embedded), kind (System, Custom), source (Directory, Local).
- Mono chip: `MonoChip` from `@/shell/components/MonoChip` in this tree, `packages/ui` after export. JetBrains Mono (`font-mono`), `text-xs` medium, uppercase, `tracking-wide`, gray-100 background and gray-700 text (dark: gray-800 and gray-300), full radius. For THIS DEVICE, WORKSPACE MEMBER, ADMINISTRATOR. Never a status or blue color.
- Count pill: blue background, white text, in navigation for unread and grouped counts.

## Tables and card lists

Header row small semibold gray-600 on gray-50; body rows body size with 12px vertical padding on desktop, 16px on phones; hover gray-50; hairline row dividers. A clickable row is reachable by keyboard: the row carries `tabindex="0"` and a `role`, Enter and Space open it, and it takes the shared focus ring. A row that holds its own buttons keeps them in the tab order after the row itself. Under 768px every table becomes a card list: one card per row with identity, status pill, and one or two scan facts, actions in an overflow menu. No horizontal scrolling.

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

## Filter disclosure

When a list carries more than two narrowing controls, they sit behind one Filters button and not in the toolbar row. The button is the secondary button with a sliders icon, and it carries a blue count pill of the filters now narrowing the list. Its panel is 288 px wide, hangs from the left edge of the button, and stacks one labelled control per filter with a Clear filters control at the foot when the count is above zero.

Sort never goes in the panel. Sort orders the list and never removes a row, so it stays in the toolbar beside the Filters button.

The panel holds no hidden state. Every active filter renders as a removable chip on its own row under the toolbar, with a Clear all control beside the chips, and the empty result carries a Clear filters control. A person reading the page must be able to see why a row is missing without opening anything.

Screens using it: the Solutions admin table (Type, Status, Category, Show archived), the Audit log (Actor, Action, Target, Date range), and the People directory (Status, Group). Groups and Roles carry one narrowing control or none and keep it in the row.

Use it where a concept needs an explanation, at most one per screen: additive grants and scopes in Access, membership-derived access against direct exceptions in People and Groups, permission bundles in Roles, the deployed image and the read-only Access column on Modules, the module-only count on Categories, the unlinked target and the anonymized actor in the Audit log, Pending against Disabled against Removed on People, directory groups against local groups on Groups, what a solution status shows members, how a chat theme reaches a solution, and the browser-side draft behind Publish in Branding. A consequence that changes what a press does belongs in the confirmation or in the result, never only here. Repeated banners, instructional cards, and debug panels stay out. A screen whose own copy already explains the concept takes none: Role detail states entitlement twice in place, so it carries no disclosure.

Components in this tree: `HelpNote` in `src/sections/access/components/ui.tsx`, `src/sections/people-groups-and-roles/components/ui.tsx`, `src/sections/audit-and-tenant-settings/components/ui.tsx`, `src/sections/solutions/components/ui.tsx`, and `src/sections/branding/components/ui.tsx`. The five are identical and become one component in `packages/ui` after the export. The audit that placed them is `../help-disclosure-audit-2026-09-19.md`.

## Buttons

Variants: primary (brand fill, `--primary-foreground` text), secondary (white fill, gray-300 border, gray-800 text), danger (red-600 fill, white text), ghost (no fill, no border, gray-700 text), and icon-only, which is a square of the same height with an `aria-label`. No variant carries a resting shadow; the fill and the hairline do the work.

A switch is a visually hidden input under a drawn track, so the track is only pressable inside a label. Either use the labelled switch row, or wrap the bare switch in a label of its own. Sizes follow the control scale: sm 32px, md 40px, lg 44px, md being the default.

States, the same four for every variant. Hover: a fill variant drops to 90% opacity, an outline or ghost variant takes a gray-50 fill. Active: 80% opacity. Disabled: 50% opacity, `cursor-not-allowed`, no hover change, and `aria-disabled` rather than the `disabled` attribute when the control must stay focusable to explain why. Loading: the label stays, a spinner replaces the leading icon, the control keeps its width, `aria-busy="true"`, and a second press does nothing. Use the loading state for any action that leaves the page or waits on the network, which is at least Publish, Save, Send test, and the sign-in redirect.

## Forms and feedback

Every control carries its own accessible name. A label that wraps its control names it; a label drawn as a sibling does not, so that control takes an `aria-label` with the same words. A field that holds two controls, for example a color picker beside its hex value, names each one.

Warning note: the one amber block, `WarningNote` in this tree. Amber-800 on amber-50 (amber-200 on amber-900/30 in dark), one alert icon, `rounded-lg`, the control radius. `sm` is the inline note under a control (`text-xs`, 10px by 6px padding); `md` is the block at the top of a card or a sheet (`text-sm`, 14px by 12px padding). It carries `role="status"` when it explains a state and nothing when it is static prose. Amber is only ever a real warning.

Label above the control, helper text below in small gray-600, field error below in small red-700 with `aria-describedby`. An input border is gray-500, which measures 4.89:1 on white, because the border is the boundary of a component and 1.4.11 asks for 3:1. The hairline gray-200 elsewhere stays, because a row divider or a card edge is decoration and the rule does not reach it. Form-level error block with `role="alert"`; informational notice block with `role="status"`. A changed field carries a small blue dot on its label while unsaved. Required fields are marked in the label.

## Overlays

Dialog: 480px wide (`max-w-[480px]`) and centered on desktop; under 768px full width and anchored to the bottom with a bottom action bar; dimmed scrim, focus trapped, Escape closes unless the spec says otherwise. This applies to every dialog, the idle-timeout countdown included: it is 480px on desktop and full width with a bottom action bar on phones, never a narrower centered card. Confirm dialog: title names the object ("Remove Alex Morgan?"), one sentence of consequence, Cancel as the default focused button, the action button in the danger tone for destructive actions and primary otherwise; closing by Escape, scrim, or Cancel is a cancel. Confirm dialog API: `ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onClose })`, built on the shared `Dialog`, Cancel focused by default; every destructive path in every section uses it. Slide-over: 480px (people, groups) or 560px (configure solution) on desktop, a right sheet on tablets, a full-height sheet on phones. Menu: 6px radius (`rounded-md`), shadow, keyboard navigable.

Focus containment is part of every modal, not a later addition: focus moves into the panel on open, Tab and Shift+Tab cycle inside it, the page behind it does not scroll, the scrim stays out of the tab order, and focus returns to the control that opened it on close. In this design tree one hook, `useModalFocus`, sits in each section's `components/helpers.ts` and carries all of it; the five copies become one primitive in `packages/ui` after the export, built on the approved Base UI dialog. `aria-modal` and a visible focus ring are labels for that behavior, never a substitute for it.

Overlays nest, so ownership is explicit. Only the innermost open overlay answers Escape and Tab. One Escape closes the confirm dialog and leaves the sheet that raised it open, with focus back on the control inside that sheet, and the next Escape closes the sheet. Stopping the scroll means two things and only two: a person cannot scroll the background, and focus cannot leave the panel. Scrolling inside the panel keeps working, because a long sheet that cannot be read is worse than a page that moves behind it. Stop the element that actually scrolls: the shell scrolls in its own container, not in `body`, so the outermost overlay hides the overflow of `body` and of every scrolling ancestor of its panel, and the last overlay to close gives them back.

Hiding the overflow is the whole mechanism. Do not add scroll-position freezing on top of it: no rewriting `scrollTop` on an event, no `position: fixed` on the body with a restored offset. Hiding the overflow stops a person, which is the requirement. It does not stop a script, and the container still moves under `element.scrollTop = n`; that is expected and is not a gap to close here.

What the design tree measures: a real wheel event over the page and a keyboard page-down, on a desktop and on a phone viewport, plus a wheel inside the open panel. What it does not measure: a touch drag, a trackpad momentum fling, a scrollbar drag, and any assistive-technology scroll. Those are unverified, not claimed. An earlier version of the check looked for any element that happened to overflow and reported no movement on a desktop viewport where nothing overflowed; every desktop result from that version is withdrawn. Reading focus when a panel opens is too late to learn which control opened it, because a panel applies its own `autoFocus` during the same commit; follow the focus while the panel is closed instead, and accept focus inside another overlay only when that overlay is the one this panel opens from.

## Toast

Bottom center on phones, bottom right on desktop; success, neutral, and error tones; auto-dismiss after 4 seconds with a manual close; at most three stacked; `role="status"`.

## Empty state

Centered block: icon or letter tile, one heading, one sentence, at most one primary action. Filter empty states offer Clear filters.

## Loading

Skeleton blocks match the shape they replace and animate only when motion is allowed. A spinner carries `role="status"` and a visually hidden label.

## Icons

Lucide, 16px in text and pills, 20px in navigation and buttons, stroke 1.75. No emoji as icons.

## Live regions

Offline bar, toasts, spinners, the password strength meter, and inline send errors announce through `aria-live` or a role. Countdown text in the idle modal updates in a `role="timer"` region.
