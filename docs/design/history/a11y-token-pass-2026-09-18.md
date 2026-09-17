# Accessibility and token pass, 2026-09-18

Last pass in this repository before `src/sections/`, `src/shell/`, and the captures move to the platform repository.

Step 0: the six files from `docs/design/` were copied over `product/` and byte-compare equal (`tokens.md`, and the specs of branding, people-groups-and-roles, solutions, audit-and-tenant-settings, sign-in-and-tenant-pages). `colors.json` and `typography.json` untouched.

Verification: `npx tsc -b` clean; `npx eslint src` clean; `grep -rn "ring-blue-500/60" src`, `grep -rn "hover:bg-blue-700" src`, `grep -rn "bg-blue-100\|bg-blue-50 text-blue-700" src/sections`, and `grep -rn "text-\[[0-9.]*px\]" src` all return nothing; every preview screen fits 390px with no horizontal scroll (the capture scripts assert it); 187 captures retaken at 390 by 844 and 1280 by 900, no toolbar, no cursor (the browser tool's ghost cursor overlay is hidden for every shot).

## Changed files

- `src/shell/`: `components/helpers.ts` (focusRing is the exact token string), `components/AppShell.tsx` (tenant tile `text-blue-600 dark:text-blue-400`, ghost hover states), `components/MainNav.tsx` (active row `dark:text-blue-400`), `components/UserMenu.tsx` (ghost hover and active), `ShellPreview.tsx` (search border gray-500, solid ring, bottom-bar button states).
- `src/sections/solutions/components/`: `helpers.ts`, `ui.tsx` (Tone `emerald`, gray Avatar and label pill, gray-500 borders, `SaveButton` with spinner, `aria-busy`, held width), `ConfigureSolutionSlideOver.tsx`, `ChatThemes.tsx`, `AdminSolutions.tsx`, `AccessOverview.tsx`, `SolutionViewer.tsx`, `SolutionCard.tsx`, `FavoritesPage.tsx`, `SolutionsHub.tsx`.
- `src/sections/people-groups-and-roles/components/`: `helpers.ts` (`rowKeyDown` Enter and Space), `ui.tsx` (`LoadingButton`), `AddPersonDialog.tsx`, `RoleForm.tsx`, `AssignmentForm.tsx`, `PeopleDirectory.tsx`, `GroupsDirectory.tsx`, `RolesDirectory.tsx`, `RoleDetail.tsx`; selected choice chips now gray with a blue border.
- `src/sections/branding/`: `components/helpers.ts` (tint strip deleted; `checkPrimaryPairs`, `primaryPasses`, `fixLightness` over six pairs), `components/BrandingPage.tsx` (six labeled pills, Publish loading), `components/ui.tsx`, `components/previews.tsx`, `BrandingPage.tsx` (`?primary=failing` is `#22c55e`: fill passes, text on nav fails).
- `src/sections/email-templates/components/EmailGallery.tsx` (Send test loading, gray-500 selects).
- `src/sections/account-and-inbox/`: `components/helpers.ts`, `ui.tsx`, `AccountPage.tsx` (gray avatar, session rows keyboard-openable, Save password loading), `Inbox.tsx`, `IdleTimeoutModal.tsx`, `SolutionsEmptyState.tsx`, and the `Inbox.tsx` preview picker.
- `src/sections/sign-in-and-tenant-pages/components/`: `helpers.ts` (`useDelayed`), `SignInPage.tsx` (loading redirect), `BreakGlassSignIn.tsx` (code boxes), `AuthFrame.tsx`; the two preview pickers.
- `src/sections/audit-and-tenant-settings/components/`: `helpers.ts`, `ui.tsx` (gray Avatar and pill, `emerald`, ConfirmDialog `busy`), `TenantSettingsPage.tsx` (Save loading), `ModulesPage.tsx`, `AuditLog.tsx` (rows Enter and Space, gray filter chips), `AuditEventSheet.tsx`, `ConfigForm.tsx`.

## Code boxes

`<fieldset>` with the visible legend "Authentication code" on the code step and the enrollment card; each box `aria-label="Digit N of 6"`, `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={1}`; a digit advances; Backspace on an empty box steps back; ArrowLeft and ArrowRight move without changing a value; a six-digit paste fills every box and focuses the last; a wrong code clears every box, refocuses the first, and the existing form-level `role="alert"` announces.

## Branding pairs

Fill light, Fill dark, Text on nav light, Text on nav dark, Count pill at 4.5:1; Focus ring at 3:1 (the lower of white and gray-50). Publish is blocked while any fails; Fix keeps the hue and moves lightness until all six pass.

## Captures retaken

All 187: shell in both chromes, phone, tablet, desktop, light and dark (four dark captures added: desktop workspace and admin, phone drawers); every screen with an avatar or a label pill; Branding Colors (default, failing, fixed) and Typography; People, Groups, Roles; break-glass credentials, code, change password, enroll, error, rate-limited; Modules, Categories, Audit, Tenant settings; email gallery.

## Not applied or read differently

1. Ghost hover on the gray-50 sidebar panel: nav rows, the drawer close, and the user-menu trigger keep a one-step-darker hover (`gray-200/60`, `gray-100`), because a gray-50 fill on a gray-50 panel is invisible. The token file names gray-50 for outline and ghost hover and does not cover a control on a tinted panel.
2. Fill dark reads the raw primary against its computed foreground, the same as Fill light, because the token file says a solid fill keeps blue-600 with white text in both themes and derives no dark shade; the previously derived dark variant against white measured 3.7:1 and would have blocked the shipped sample. So Fill light and Fill dark show the same ratio; if the platform derives a dark fill, the pair changes.
3. The Administrator pill on the break-glass card and the sign-in information banner keep their blue tint, because the sign-in spec names them blue-tinted; the audit filter chips and the selected choice chips went gray.
4. The account page has no preferences Save (it saves on change), so the loading state went on Save password. The Favorites page rows expose an explicit Open button and are not whole-row targets. RoleDetail's assignments table has no row target.
5. A `<tr>` focus ring is a box-shadow; under `border-collapse` Chrome may not paint it, so rows also keep a gray focus tint as a fallback.
6. Loading states are transient (about 900 ms in the design) and are not captured.
