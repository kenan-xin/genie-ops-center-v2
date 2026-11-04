import type { NavigationEntry } from "../module-contract/module.ts";

/**
 * Core's own workspace pages (AG23, `czjw.76`): Ask, first in the workspace block and in the rail.
 * They pass the same `can()` filter as module entries in `permittedNavigation`, and no entitlement
 * gates them. Home never sends a person here, because a tool is not a landing page.
 */
export const CORE_WORKSPACE_NAVIGATION: readonly NavigationEntry[] = [
  {
    id: "core-ask",
    label: "Ask",
    path: "/ask",
    surface: "workspace",
    requiredPermission: "core:ask:use",
  },
];
