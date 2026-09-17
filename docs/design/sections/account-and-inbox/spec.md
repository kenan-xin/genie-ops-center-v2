# Account and Inbox Specification

## Overview
Delivered early: the platform defers the inbox screen (`DEC-21`, platform roadmap Section 5 item 8). The inbox design below stays as specified, the shell hides its navigation entry and unread pill until the platform schedules it, and the notification table and kinds already exist.

The personal screens inside the shell. The account page shows the person's identity as synced from the company directory, their active sessions, their personal preferences, and a read-only summary of their roles. The inbox lists notifications newest first with read state. The idle-timeout modal and the Solutions hub empty state complete the section.

## User Flows
- Person opens Account from the user footer menu and sees four blocks: Profile, Sessions, Preferences, Roles and access.
- Person reads their name, email, and groups in Profile. A note says that changes are made in the company directory, not in Genie.
- Person reviews active sessions, recognizes an unknown device, and signs it out. Each session shows browser, device, IP address (not a geographic location), signed in, and last active. The current session is marked and cannot be revoked from the list. "Sign out all other sessions" ends every other session at once.
- Break-glass administrator opens Account and sees a variant with Profile, Change password (current password required, the shared password rule and meter), Authenticator (re-enroll), and Sessions. No Preferences block and no Roles and access block.
- Person changes language, time zone, or theme in Preferences. Each control saves on change and confirms with a toast. "Use tenant default" resets one control.
- Person reads the roles they hold and the scope of each in Roles and access. Nothing is editable here.
- Person opens Inbox from the sidebar and sees notifications newest first, unread ones marked. They open one, which marks it read and goes to the linked record. "Mark all as read" clears the unread count in the sidebar.
- Person with no notifications sees an empty inbox state.
- Person idle for the tenant's timeout minus two minutes sees a countdown modal with two minutes left. Ordinary activity (pointer, keyboard, touch) before the warning extends the server session silently, throttled to half the idle window, so the modal appears only after real inactivity. "Stay signed in" extends the session. When the countdown reaches zero they are signed out and land on the sign-in page with the expired banner.
- Person with no solution grants opens the Solutions hub and sees an empty state that says who to ask and shows the support contact.

## UI Requirements
- Account page: one column of stacked blocks with a Plus Jakarta Sans block title and a one-line description each. Max width for reading. No tabs.
- Profile block: avatar tile with initials, name, email, list of groups as chips with the source (directory or local), and a muted note about where to change details. For a local-account tenant a "Change password" link opens the realm's account page in a new tab; brokered tenants show no link.
- Designed mobile first; phone layout is the base and the desktop layout adds columns. On phones the sessions table is a card list with the current session first, and each block stacks full width.
- Sessions block: table with device and browser, IP address, signed in, last active, and an action column. Current session row carries a THIS DEVICE mono chip and no action. Per-row "Sign out" and a block-level "Sign out all other sessions" each open the shared confirm dialog (title names the device or the count, one consequence sentence, Cancel focused, danger tone).
- Toasts: preference saves ("Time zone saved.") and the break-glass password change ("Password changed.") confirm with the shared toast: bottom center on phones, bottom right on desktop, 4 seconds, manual close.
- Preferences block: up to three controls in a two-column form: language (select from the tenant's available list, hidden when only one language is available), time zone (searchable select), theme (segmented light, dark, system). Each shows the tenant default as helper text and a "Use tenant default" link when overridden.
- Roles and access block: list of roles, each with its permission count and scope (whole tenant, or a scoped record such as a solution name). Read-only, with a note to contact an administrator for changes.
- Inbox: full-width list, newest first. Each row has a kind icon, title, body preview clamped to two lines, relative time, and an unread dot in the primary blue. Unread rows use a bolder title. Header has the unread count and "Mark all as read". Row click marks read and follows the link.
- Inbox empty state: inbox icon, one heading, one sentence. Inbox load-more at 25 rows.
- Break-glass variant, rendered in the admin chrome at `/admin/account`: Profile (email, identity source "Genie (local password and authenticator)", description "Local administrator account. Password and authenticator are managed on this page."), Change password block (current, new, confirm, the first three rules shown as met or unmet, the provisioning-password rule neutral "Checked when you save", Save), Authenticator block (enrolled since, Re-enroll button that returns to the enrollment card), Sessions. No Preferences block and no Roles and access block.
- Idle-timeout modal: dialog over a dimmed shell (480px centered on desktop, full width with a bottom action bar on phones), title "Still there?", a large mono countdown in minutes and seconds, body text, primary "Stay signed in" and secondary "Sign out now". Focus trapped, Escape does nothing.
- Solutions hub empty state: centered block in the content area with the tenant letter tile, heading "No solutions yet", the line "Ask your administrator to grant you access to a solution.", and the support contact when branding provides one.
- Light and dark themes, WCAG 2.1 AA, tokens from the design system: blue for primary actions, unread marks, and label pills, semantic emerald, red, and amber only for real status, gray neutrals.
- Out of scope: editing profile fields, password or authenticator management inside Genie (a local-account member changes their password on the realm's account page, linked from the user menu), notification filters, notification preferences, and the admin's own account page variant.

## Configuration
- shell: true
