/** Every module ledger table starts with this prefix (Spec 1 R-9). */
const LEDGER_PREFIX = "__drizzle_migrations_";

/**
 * The ledger table a module's migration history records into, derived from the
 * module id alone (Spec 1 R-9/R-79, DEC-50,
 * `docs/architecture/module-contract.md` Schema row).
 *
 * The name is the fixed `__drizzle_migrations_` prefix followed by the id with
 * every hyphen written as an underscore, so `contract-data` records into
 * `__drizzle_migrations_contract_data`. The startup omission check finds an
 * installed module by this ledger in the `drizzle` schema, because an image that
 * omits a module cannot read its declaration, so the spelling is a contract rule
 * and `validateModule` rejects any other name. Ids are kebab-case and never hold
 * an underscore, so a name maps back to exactly one id.
 */
export function moduleLedgerTable(moduleId: string): string {
  return `${LEDGER_PREFIX}${moduleId.replaceAll("-", "_")}`;
}

/**
 * The module id a ledger table names, or `undefined` when the name is not a
 * module ledger. It is the inverse of `moduleLedgerTable`: the prefix is
 * stripped and every underscore is written back as a hyphen, so
 * `__drizzle_migrations_contract_data` maps to `contract-data`.
 *
 * The startup omission check reads an installed module's id from this name,
 * because the image that omits the module cannot read its declaration (R-79).
 * Core's own `__drizzle_migrations` has no trailing underscore after the
 * prefix, so it is not a module ledger and never matches.
 */
export function moduleIdFromLedgerTable(table: string): string | undefined {
  if (!table.startsWith(LEDGER_PREFIX)) return undefined;

  return table.slice(LEDGER_PREFIX.length).replaceAll("_", "-");
}
