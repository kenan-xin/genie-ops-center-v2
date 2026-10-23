import type { Module } from "./module.ts";

/** True when the module declares a pinned or listed workspace entry (R-84, R-88, R-91a). */
export function hasWorkspaceEntry(module: Module): boolean {
  return [...module.navigation.pinned, ...module.navigation.entries].some(
    (entry) => entry.surface === "workspace"
  );
}
