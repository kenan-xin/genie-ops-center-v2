import type { PermissionKey } from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { eligibility } from "./eligibility.ts";
import { permissionCatalogue } from "./roles.ts";

/** A group or a person that holds a key through one role. One principal appears once per role. */
export type PermissionHolder = {
  readonly principalType: "user" | "group";
  readonly principalId: string;
  readonly label: string;
  readonly roleName: string;
};

const { inactivePerson, activeGroup } = eligibility("u", "g");

/**
 * Every assignment of a role that carries one of the keys, by the grant reader's rules: an erased
 * person, a person under a ban that has not expired and an archived group hold nothing, and neither
 * does a principal whose row is gone. The break-glass account appears only in the audit log (R-39).
 * The group id is compared as text, so a user id that is not a uuid never reaches a cast.
 */
const HOLDERS_SQL = `
  select k.key, a.principal_type as "principalType", a.principal_id as "principalId",
         coalesce(u.name, g.name) as label, r.name as "roleName"
    from role_assignment a
    join role r on r.id = a.role_id
    cross join unnest(r.permissions) as k(key)
    left join "user" u on a.principal_type = 'user' and u.id = a.principal_id
    left join "group" g on a.principal_type = 'group' and g.id::text = a.principal_id
   where k.key = any($1::text[])
     and ((u.id is not null and u.is_break_glass = false and not ${inactivePerson})
       or (g.id is not null and ${activeGroup}))
   order by a.principal_type, lower(coalesce(u.name, g.name)), r.name`;

/**
 * The groups and people who hold each key through a role. The read applies the grant reader's
 * rules, so a screen that lists them shows exactly whom `can()` grants (DEC-39, DEC-48). A key that
 * no compiled module declares grants nothing and has no holder (R-33b). Every key gets an entry.
 */
export async function readHolders(
  tenant: Pick<TenantContext, "db">,
  modules: readonly Pick<Module, "permissions">[],
  keys: readonly PermissionKey[]
): Promise<ReadonlyMap<PermissionKey, readonly PermissionHolder[]>> {
  const catalogue = permissionCatalogue(modules);

  const result = await tenant.db.$client.query<
    PermissionHolder & { readonly key: PermissionKey }
  >(HOLDERS_SQL, [keys.filter((key) => catalogue.has(key))]);

  const holders = new Map<PermissionKey, PermissionHolder[]>(
    keys.map((key) => [key, []])
  );

  for (const { key, ...holder } of result.rows) holders.get(key)?.push(holder);

  return holders;
}
