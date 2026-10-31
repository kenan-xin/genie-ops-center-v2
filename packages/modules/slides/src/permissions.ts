import type { Module } from "@genie/core";

/**
 * The module's permission keys. A file of its own, so that a plain-Node caller (the demo seed)
 * builds a principal without loading the module's `.tsx` pages.
 */
export const SLIDES_PERMISSIONS = [
  { key: "slides:use", label: "Use the Slides workspace" },
  { key: "slides:read", label: "Open your own decks" },
  { key: "slides:write", label: "Make and change your own decks" },
] as const satisfies Module["permissions"];
