import { implementModule } from "@genie/core";

import { invoicesContract } from "./contract.ts";

const os = implementModule("invoices", invoicesContract);

/**
 * The module's router, built by core from the contract and mounted under the module id when the
 * module is enabled. Every handler reads through `context.tenant.db` and checks access through
 * `can()` or `scopesFor()` (DEC-34, DEC-39). The `implementModule` base refuses a call with
 * `module-disabled` when the entitlement is off, before any handler runs.
 */
export const invoicesRouter = os.router({});

export type InvoicesRouter = typeof invoicesRouter;
