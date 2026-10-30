import type { Module } from "@genie/core";

/**
 * The module's permission keys. A file of its own, so that a plain-Node caller (the demo seed)
 * builds a principal without loading the module's `.tsx` pages.
 */
export const INVOICES_PERMISSIONS = [
  { key: "invoices:read", label: "Read invoices, payments and customers" },
  {
    key: "invoices:write",
    label: "Save invoices and payments and change their links",
  },
  { key: "invoices:use", label: "Use the Invoices and Payments workspace" },
] as const satisfies Module["permissions"];
