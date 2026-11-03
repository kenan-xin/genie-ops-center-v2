/**
 * The names of core's three system roles (R-33, A7). They live apart from the seeding code, so the module
 * contract's validator can name them without importing the database schema.
 */
export const TENANT_ADMINISTRATOR_ROLE = "Tenant administrator";

export const AUDITOR_ROLE = "Auditor";

/** The role that grants Ask and the agent (`core:ask:use`), assigned to nobody at seeding. */
export const ASK_USER_ROLE = "Ask user";
