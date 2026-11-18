import type { RolePermissionGroup } from "./types.ts";

/**
 * The lead of "What this role allows" (role-detail.prototype.html): "10 permissions: Core and 2
 * modules.", "1 permission: Core.", "3 permissions: 1 module.", or "No permissions.".
 */
export function permissionCountLine(
  groups: readonly RolePermissionGroup[]
): string {
  const total = groups.reduce((sum, group) => sum + group.keys.length, 0);

  if (total === 0) return "No permissions.";

  const modules = groups.filter((group) => group.moduleId !== "core").length;

  const parts = [
    ...(groups.some((group) => group.moduleId === "core") ? ["Core"] : []),
    ...(modules === 0
      ? []
      : [`${modules} ${modules === 1 ? "module" : "modules"}`]),
  ];

  return `${total} ${total === 1 ? "permission" : "permissions"}: ${parts.join(" and ")}.`;
}
