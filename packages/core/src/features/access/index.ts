export { AccessTabs } from "./access-tabs.tsx";

export { type AccessLink, accessHref } from "./access-link.ts";

/**
 * The browser-safe Access feature: the Grants and Overview screens and their parts. It imports no database, no
 * registry and no environment value, so the Storybook host and the application both render it
 * without a running deployment.
 */
export { GrantsScreen, type GrantsScreenProps } from "./grants-screen.tsx";

export { scopeKey } from "./advanced-view.ts";

export {
  type OverviewPage,
  OverviewScreen,
  type OverviewScreenProps,
} from "./overview-screen.tsx";
