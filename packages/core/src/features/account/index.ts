/**
 * The browser-safe Account page feature (R-18): the page's three Section 2 blocks and the
 * browser activity client. It imports no database, no registry, and no environment value, so
 * the Storybook host and the application both render it without a running deployment.
 */
export { AccountPage } from "./account-page.tsx";

export {
  SessionActivity,
  type SessionActivityResult,
  type SessionActivityProps,
} from "./session-activity.tsx";

export {
  type AccountGroup,
  type AccountPageProps,
  type AccountRoleGrant,
  type AccountSession,
} from "./types.ts";
