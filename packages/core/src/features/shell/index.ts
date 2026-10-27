/**
 * The browser-safe shell feature: the empty state a viewer without a solution grant sees on the
 * home page. It imports no database and no environment value.
 */
export {
  NoGrantsEmptyState,
  type NoGrantsEmptyStateProps,
} from "./no-grants-empty-state.tsx";

export { PageHeader, type PageHeaderProps } from "./page-header.tsx";

export { PageSkeleton, type PageSkeletonProps } from "./page-skeleton.tsx";

export { RouteFocus } from "./route-focus.tsx";

export { AppShell, type AppShellProps } from "./app-shell.tsx";

export { activeHref } from "./active-link.ts";

export { shellChrome, shellMenu, type ShellMenuInput } from "./menu-model.ts";

export {
  COLLAPSED_CATEGORIES_KEY,
  readCollapsed,
  writeCollapsed,
} from "./collapsed-categories.ts";

export {
  NavigationRail,
  type NavigationRailProps,
} from "./navigation-rail.tsx";

export {
  brandingHead,
  BrandingHeadElements,
  type BrandingHead,
} from "./branding-head.tsx";

export {
  DEFAULT_MARK_URL,
  IdentityBlock,
  TenantMark,
} from "./identity-block.tsx";

export { UserMenu, type UserMenuProps } from "./user-menu.tsx";

export { OfflineBar } from "./offline-bar.tsx";

export type {
  ShellAdminGroup,
  ShellCategory,
  ShellChrome,
  ShellIdentity,
  ShellLink,
  ShellLinkComponent,
  ShellMenu,
  ShellNavigation,
  ShellStrings,
  ShellUser,
} from "./types.ts";
