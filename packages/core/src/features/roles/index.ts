/**
 * The browser-safe Roles feature: the directory, the role form and their presentation types. It
 * imports no database, no registry and no environment value, so the Storybook host and the
 * application both render it without a running deployment.
 */
export { RolePermissionList, RolesScreen } from "./roles-screen.tsx";

export {
  type Role,
  type RoleAssignment,
  type RoleDetail,
  type RoleInput,
  type RoleKind,
  type RolePermissionGroup,
  type RolePermissionKey,
  type RolesScreenProps,
  type RolesViewer,
} from "./types.ts";
