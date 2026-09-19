---
name: Genie Ops Center
description: The fixed base token layer of a tenant-brandable enterprise platform — calm utility, hairline surfaces, one tenant accent
colors:
  primary: "#2563eb"
  primary-ink: "#1d4ed8"
  focus-blue: "#3b82f6"
  focus-blue-dark: "#60a5fa"
  info-tint: "#eff6ff"
  page: "#ffffff"
  panel: "#f9fafb"
  tile: "#f3f4f6"
  hairline: "#e5e7eb"
  control-border: "#d1d5db"
  icon-muted: "#6b7280"
  text-secondary: "#4b5563"
  text-idle: "#374151"
  hairline-dark: "#1f2937"
  heading: "#111827"
  page-dark: "#030712"
  success: "#047857"
  success-tint: "#ecfdf5"
  danger: "#dc2626"
  danger-text: "#b91c1c"
  danger-tint: "#fef2f2"
  warning: "#92400e"
  warning-tint: "#fffbeb"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  secondary:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  caption:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  control:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.025em"
rounded:
  menu: "6px"
  control: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  base: "4px"
  card: "20px"
  card-desktop: "24px"
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 14px"
    typography: "{typography.control}"
  button-secondary:
    backgroundColor: "{colors.page}"
    textColor: "#1f2937"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
    typography: "{typography.control}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 14px"
    typography: "{typography.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-idle}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 8px"
    typography: "{typography.secondary}"
  input:
    backgroundColor: "{colors.page}"
    textColor: "{colors.heading}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.card}"
    padding: "20px"
  pill-status:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    typography: "{typography.caption}"
  mono-chip:
    backgroundColor: "{colors.tile}"
    textColor: "{colors.text-idle}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
    typography: "{typography.mono}"
  nav-row-active:
    backgroundColor: "{colors.page}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    height: "40px"
    typography: "{typography.secondary}"
  count-pill:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
    typography: "{typography.caption}"
---

# Design System: Genie Ops Center

## Overview

**Creative North Star: none, by design.** This file documents the fixed base token layer — what every tenant starts from and what no tenant can change. The layer deliberately carries no editorial personality: visual identity is each tenant's contribution through the one customizable brand color and the approved font list, so the fixed layer stays neutral enough to sit under any of them. The values shown here are reference defaults, not brand choices — `blue-600` stands in for the shadcn `--primary` variable that Branding fills per request.

The voice is calm utility. A white page, a soft gray sidebar panel with rounded corners, hairline borders, rounded rows and pills, generous air between things. The work is the loudest element on screen; polish lives in precision (measured contrast values, one focus ring, one height scale) rather than decoration. Depth is conveyed by hairlines and tonal steps, not shadow. The system is thumb-first and forgiving: every screen is designed at phone width before any wider layout, controls keep 44px touch targets under 1024px, and phone flows use bottom sheets rather than shrunken desktops.

Authority chain: `docs/design/design-system/tokens.md` is the source of truth for the fixed layer; where a reference component or capture disagrees, the token file wins. A binding product constraint rides along from PRODUCT.md: the fixed layer and the defaults of the customizable layer must look good and well designed on their own — tenant overrides sit on top of good defaults and never excuse them.

**Key Characteristics:**

- Mobile-first utility: phone layout is the base; tables become card lists under 768px, inspectors become sheets
- One tenant accent, used sparingly: primary button, count pill, active nav row, focus ring — nothing else
- Hairline borders over shadows; only menus and overlays cast shadows
- Plus Jakarta Sans everywhere; JetBrains Mono stamps identifiers (hex values, permission keys, ids, chips like THIS DEVICE)
- Thumb-first controls: one height scale (32/40/44px), 44px minimum touch targets under 1024px
- Motion is 150–220ms ease-out, no bounce, no scale, always `motion-safe:` gated
- WCAG 2.1 AA with measured contrast pinned in the token file (ring 3.68:1 on white, input border 4.89:1)

## Colors

A quiet, near-neutral gray world in which the single accent is whatever the tenant pours into `--primary`; blue-600 is only the default refill.

### Primary

- **Default primary** (#2563eb, blue-600): the default value of the tenant-fillable `--primary`. Fills solid surfaces only — the primary button and the count pill. A solid brand fill keeps this value with white text in both themes.
- **Primary ink** (#1d4ed8, blue-700): brand as text and icon on light surfaces — the active navigation row's text and icon, and links.
- **Focus blue** (#3b82f6, blue-500): the keyboard focus ring on light surfaces; opaque because it must hold 3:1 against the surface behind it (3.68:1 on white).
- **Focus blue, dark** (#60a5fa, blue-400): the focus ring and brand-as-text in the dark theme (7.92:1 on gray-950). Blue-600 as text is forbidden in dark: it measures 3.90:1 on gray-950 and fails AA at `text-sm`.
- **Informational tint** (#eff6ff, blue-50): informational notice blocks and selected or focused table rows — this tint carries state, not brand.

There is no secondary or tertiary accent. Blue is the only action and information color in the samples, and only `--primary` and `--primary-foreground` are computed from tenant input.

### Neutral

- **Page** (#ffffff): the page canvas. In dark, the sidebar shares the page surface (gray-950) so the border, not a fill change, separates them.
- **Panel** (#f9fafb, gray-50): the floating sidebar panel, table header rows, and row hover.
- **Tile** (#f3f4f6, gray-100): person avatars and mono chip backgrounds — tinted surfaces that stand for identity stay fixed neutral gray.
- **Hairline** (#e5e7eb, gray-200): card edges, row dividers, and other decorative hairlines; decoration, so 1.4.11 does not reach it. Dark mirror #1f2937 (gray-800).
- **Control border** (#d1d5db, gray-300): input and secondary button borders — the boundary of a component, measured 4.89:1 on white for 1.4.11.
- **Icon muted** (#6b7280, gray-500): icons, labels, and helper text — the lightest text ever gets (dark mirror: gray-400).
- **Text secondary** (#4b5563, gray-600): helper text and table headers (dark mirror: gray-300).
- **Text idle** (#374151, gray-700): body text on tinted surfaces, idle navigation rows, ghost buttons.
- **Heading** (#111827, gray-900): headings and strong text; dark body text is gray-100 on **Page dark** (#030712, gray-950).

### Semantic

- **Success** (#047857 emerald-700 on #ecfdf5 emerald-50): the Active / Ready / Entitled family of status pills; a met password-rule check.
- **Danger** (#dc2626 red-600 fill; #b91c1c red-700 text on #fef2f2 red-50): danger buttons, Disabled / Down status pills, field errors, and the offline bar (solid red-600 with white text).
- **Warning** (#92400e amber-800 on #fffbeb amber-50): Maintenance / Stale status pills; amber only for real warnings.

### Named Rules

**The One Ink Rule.** The tenant color appears in exactly four places: the primary button, the count pill, the active navigation row's text and icon, and the focus ring. The sidebar panel and the page chrome never take it.

**The No-Ramp Rule.** No tint ramp is derived from the tenant color. A hover or active state is the same color at reduced opacity — 90% on hover, 80% on press — never a derived shade. An identity or label surface (avatar, monogram tile, label pill) stays fixed neutral gray, so `packages/ui` needs no color-space computation.

**The State-vs-Label Rule.** A tint that carries state or meaning keeps its blue and is not brand: a selected table row, an informational notice. A pill that labels a thing (Admin portal, Notice, counts, type labels, kind, source) is gray or blue, never a status color. The test is whether the tenant's color would be wrong there.

## Typography

**Display Font:** Plus Jakarta Sans (system-ui fallback)
**Body Font:** Plus Jakarta Sans (system-ui fallback)
**Label/Mono Font:** JetBrains Mono (ui-monospace fallback), for identifiers only: hex values, permission keys, ids, and chips such as THIS DEVICE

**Character:** one humanist sans doing everything, quietly; the mono face appears only to stamp an identifier, never for prose. Both faces are self-hosted in the image — subset to latin and latin-ext, `font-display: swap`, preload the one weight the sign-in page paints first — because a regulated customer can refuse an outbound request from the sign-in page.

### Hierarchy

- **Display** (700, 1.5rem / `text-2xl`, line-height 1.25, tight tracking): the largest the product gets. Steps down to 1.25rem below `lg`.
- **Title** (700, 1.25rem / `text-xl`): page titles and dialog titles. Steps down to 1.125rem below `lg`.
- **Heading** (600, 1.125rem / `text-lg`): card and section headings.
- **Body** (400, 1rem / `text-base`): working text.
- **Secondary** (400 or 500, 0.875rem / `text-sm`): navigation rows, menu items, helper text.
- **Caption** (500–600, 0.75rem / `text-xs`; uppercase with wide tracking in group labels and mono chips): labels, pills, chips, counts, table headers.

### Named Rules

**The No Arbitrary Pixels Rule.** The scale is the Tailwind type utilities and nothing else. Any `text-[13.5px]` or `text-[Npx]` is forbidden in every component — `grep -rn "text-\[[0-9.]*px\]" src` must return nothing.

**The Root-Follows-the-Preset Rule.** The tenant font-size preset (Branding, Typography tab) sets the root font size to 14, 15, or 16px, and the rem-based scale follows the root without per-component changes. Control heights do not follow it: they are fixed pixels at every preset, so a touch target keeps its size when a tenant picks Compact.

## Layout

Sidebar shell. On desktop (1024px and up) a 240px sidebar sits left as a floating rounded-xl gray-50 panel inset in the white page, with the tenant identity block at its top, navigation in the middle, and the user footer pinned to the bottom; the content area scrolls independently. A 54px header above the content is not a bar but the page's own head: page title and a one-line description on the left, search and actions on the right, no bell. On phones (under 768px, the base design) the sidebar becomes a drawer capped at 84vw (max 320px) over a dimmed scrim, and a page's primary action moves into a sticky bottom bar.

Spacing rhythm: 4px base. Page gutters run 16px on phones, 24px on tablets, 32px on desktop (`px-4 md:px-6 lg:px-8`). Card padding is 20px, 24px on desktop. Table rows carry 12px vertical padding on desktop, 16px on phones.

Responsive doctrine: mobile first, and no action is available only on desktop. Under 768px every table becomes a card list (one card per row: identity, status pill, one or two scan facts, actions in an overflow menu — no horizontal scrolling), inspectors and dialogs render as full-height or bottom sheets, and primary actions sit in the sticky bottom bar. At 768–1023px inspectors become right-hand sheets and tables may return to rows with fewer columns. Overlays: dialogs are 480px wide and centered on desktop; slide-overs are 480px (people, groups) or 560px (configure solution) on desktop.

## Elevation & Depth

Hairline-first and nearly flat. Resting surfaces are separated by borders (gray-200 on light, gray-800 on dark) and tonal steps (a white page beside a gray-50 panel), not by shadow. Shadows belong exclusively to things that float above the page: menus, dialogs, sheets, slide-overs, and the mobile drawer. Scrim behind an overlay is a dim (25–40% gray-900) with a 1–2px backdrop blur.

### Shadow Vocabulary

- **Menu** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): dropdown menus and the upward-opening user menu.
- **Overlay** (`box-shadow: 0 25px 50px -12px rgb(17 24 39 / 0.1)`): dialogs, sheets, slide-overs, and the navigation drawer.

### Named Rules

**The Hairline-First Rule.** A resting surface gets a border, not a shadow. If it is not a menu or an overlay, it does not cast.

## Shapes

Restrained rounding, on a four-step ladder: menus at 6px (`rounded-md`), controls and navigation rows at 8px (`rounded-lg`), cards, dialogs, sheets, and the sidebar panel at 12px (`rounded-xl`), pills at full radius. The tenant letter tile is 6px small / 8px medium; avatars are circles. Sharp corners, left-edge accent rules, and near-black fills are all rejected form language. Icon-only controls are squares of their height scale (40px md, 32px sm in dense toolbars).

Radius refinement, 2026-09-18: reduce rounding without changing spacing, typography, control heights, hit areas, colors or behavior. The same values apply across light/dark themes and viewport sizes. Warning/info callouts use the 8px control radius. Preserve full rounding for badges, chips, switch tracks and circular avatars; these are not rectangular controls. Apply sheet radii only to exposed corners. Existing screenshots and reference components require a separate design-agent update; this document does not claim rendered verification.

## Components

Thumb-first and forgiving: restrained 8px control corners, generous heights, sheet-based phone flows; feedback by opacity and hairline, never by drama.

### Buttons

- **Shape:** 8px radius; heights 32px (sm) / 40px (md, the default) / 44px (lg); icon-only variants are squares of the same height with an `aria-label`.
- **Primary:** brand fill (`--primary`, default #2563eb) with `--primary-foreground` text (white), semibold 0.875rem, 14px horizontal padding.
- **Secondary:** white fill, gray-300 border, gray-800 text. **Danger:** red-600 fill, white text. **Ghost:** no fill, no border, gray-700 text, 32px height.
- **Hover / Focus:** fill variants drop to 90% opacity on hover and 80% on press — the same color, never a derived shade; outline and ghost variants take a gray-50 fill on hover. Focus is always the shared 2px opaque blue-500 ring at 2px offset.
- **Disabled / Loading:** disabled is 50% opacity with `cursor-not-allowed` and no hover change; use `aria-disabled` instead of the `disabled` attribute when the control must stay focusable to explain why. Loading keeps the label and the width, replaces the leading icon with a spinner, sets `aria-busy="true"`, and ignores a second press. Any action that leaves the page or waits on the network uses the loading state (at least Publish, Save, Send test, the sign-in redirect).

### Chips

- **Status pill:** tinted background, semibold small text. Active / Ready / Entitled emerald; Pending / Draft / Not entitled gray; Disabled / Down red; Maintenance / Stale amber.
- **Label pill:** gray or blue, never a status color. Used for Admin portal, Notice, counts, type labels (Chat, Embedded), kind (System, Custom), source (Directory, Local).
- **Mono chip:** JetBrains Mono 0.75rem medium, uppercase, wide tracking, gray-100 background, gray-700 text (dark: gray-800 / gray-300), full radius. For THIS DEVICE, WORKSPACE MEMBER, ADMINISTRATOR — never a status or blue color.
- **Count pill:** brand fill, white text, in navigation for unread and grouped counts; caps at 99+.

### Cards / Containers

- **Corner Style:** 12px radius.
- **Background:** white (dark: gray-900), on the white page — separation by hairline border, not fill or shadow.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px gray-200 (dark: gray-800).
- **Internal Padding:** 20px, 24px on desktop.

### Inputs / Fields

- **Style:** 40px height, 8px radius, 1px gray-300 border (4.89:1 on white — the border is a component boundary under 1.4.11), white background, 12px horizontal padding.
- **Focus:** border shifts to blue-500 plus the shared ring.
- **Labels / Helper / Error:** label above the control (semibold small gray-800), helper text below in small gray-600, field error below in small red-700 with `aria-describedby`. Form-level error block carries `role="alert"`; informational notice block `role="status"`. A changed field carries a small blue dot on its label while unsaved; required fields are marked in the label.

### Navigation

- **Style:** rounded-lg rows, 0.875rem; 44px minimum height under 1024px (touch), 40px nav rows and 32px tree rows on desktop. Group labels are 0.75rem semibold uppercase, wide tracking, gray-500.
- **States:** idle gray-700 text with a gray-200/60 hover fill; active row is an 8px-rounded white row with a hairline ring and blue text and icon (`aria-current="page"`). Icons 20px in nav rows (16px in tree rows), gray-500 idle, blue when active.
- **Mobile treatment:** the hamburger opens the drawer (84vw, max 320px) over a dimmed scrim; route change or scrim tap closes it. Category collapse state persists per device, not per account.

### Tables and Card Lists

Header row: 0.75rem semibold gray-600 on gray-50. Body rows: 0.875rem, 12px vertical padding on desktop (16px on phones), gray-50 hover, hairline dividers. A clickable row is keyboard-reachable: `tabindex="0"` with a role, Enter and Space open it, it takes the shared focus ring, and buttons inside stay in the tab order after the row. Under 768px every table becomes a card list with no horizontal scrolling.

### Overlays

Dialog: 480px wide, centered on desktop; under 768px full width, anchored to the bottom with a bottom action bar — every dialog, the idle-timeout countdown included. Focus trapped, Escape closes. Confirm dialog: title names the object ("Remove Alex Morgan?"), one sentence of consequence, Cancel as the default focused button, the action button in the danger tone for destructive actions. Slide-over: 480px or 560px on desktop, right sheet on tablets, full-height sheet on phones. Menu: 6px radius, shadow, keyboard navigable.

### Toast

Bottom center on phones, bottom right on desktop. Success, neutral, and error tones; auto-dismiss after 4 seconds with a manual close; at most three stacked; `role="status"`.

### Empty State

Centered block: an icon or letter tile, one heading, one sentence, at most one primary action. Filter empty states offer Clear filters.

### Loading

Skeleton blocks match the shape they replace and animate only when motion is allowed. A spinner carries `role="status"` and a visually hidden label. No spinner replaces a whole page.

### Icons

Lucide, 16px in text and pills, 20px in navigation and buttons, stroke 1.75. No emoji as icons.

## Do's and Don'ts

### Do:

- **Do** apply the one shared `focusRing` constant to every interactive element — 2px opaque blue-500 ring at 2px offset (blue-400 in dark) — and never write `outline: none` without it.
- **Do** keep every interactive row and icon button at least 44px tall under 1024px (`min-h-11 lg:min-h-0`); give 32px controls invisible padding to reach 44 by 44.
- **Do** write every `transition-*` and `animate-*` utility under `motion-safe:` (or pair a `motion-reduce:` reset).
- **Do** route every destructive path through the shared ConfirmDialog with Cancel focused by default.
- **Do** turn every table into a card list under 768px — one card per row, actions in an overflow menu, no horizontal scrolling.
- **Do** use the loading state for any action that leaves the page or waits on the network.

### Don't:

- **Don't** derive any tint, shade, or ramp from the tenant color; hover is 90% opacity of the same color, press is 80%.
- **Don't** use arbitrary text sizes (`text-[13.5px]`, any `text-[Npx]`) in any component.
- **Don't** put a shadow on a resting surface; hairline borders separate, and shadows belong to menus and overlays.
- **Don't** give a label pill a status color, and don't use emoji as icons — Lucide only, stroke 1.75.
- **Don't** add a bell or notification button to the header; notifications surface only through the Inbox nav item and its count pill.
- **Don't** use near-black fills, sharp corners, or left-edge accent rules; the dark theme is gray-950 surfaces with hairline borders.
