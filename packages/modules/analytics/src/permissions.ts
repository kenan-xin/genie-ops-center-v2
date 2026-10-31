import type { Module } from "@genie/core";

/**
 * The module's permission keys. A file of its own, so that a plain-Node caller (the demo seed)
 * builds a principal without loading the module's `.tsx` pages.
 */
export const ANALYTICS_PERMISSIONS = [
  { key: "analytics:use", label: "Use the Analytics workspace" },
  { key: "analytics:read", label: "Open your own dashboards" },
  { key: "analytics:write", label: "Build and change your own dashboards" },
] as const satisfies Module["permissions"];
