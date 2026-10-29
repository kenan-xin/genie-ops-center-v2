/**
 * The module-facing declaration. The application imports this and nothing else: the registry
 * mounts the router and the record types from the one object below.
 */

export { invoicesModule } from "./module.ts";

export { invoicesContract, type InvoicesContract } from "./contract.ts";

export { invoicesRouter, type InvoicesRouter } from "./router.ts";

export {
  allocation,
  allocationEvent,
  customer,
  fieldOrigin,
  invoice,
  MIGRATIONS,
  MIGRATIONS_TABLE,
  payment,
  sourceDocument,
} from "./schema.ts";
