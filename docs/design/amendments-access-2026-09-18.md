# Amendments the Access redesign needs

Date: 2026-09-18. Author: design owner. Status: raised, not applied.

This round moves every grant and revoke into one core screen, Access. The design tree is updated. The platform documents are not: this file lists what a document says today, what the design needs, and why. Nothing under `/home/kenan/work/genie-ops-center-v2` was edited. The platform owner decides each item.

The rule that does not change: core stays the only writer of `role_assignment`, and a module never writes one (`DEC-39`). This redesign moves that one writer from the Roles screen to the Access screen. It does not add a second writer and it adds no second permission system.

## Amendments

### A1. Spec 02, R-37: the admin portal has four identity screens, not three

Today: "Three core routers, each procedure behind `can()` with `core:people:manage`, `core:groups:manage`, or `core:roles:manage`, back the three admin portal screens."

Needed: four screens. People, Groups, Roles, and Access. The roles router keeps `core:roles:manage` and now backs two screens: Roles for the definitions, Access for the assignments. No new router and no new permission key.

Why: an administrator was expected to find the right role before granting anything. The new path is recipient, module, access level, records, and the screen picks the predefined role.

### A2. Spec 02, R-38: the writers that call the last-administrator check

Today the list names "remove a direct assignment, remove an assignment from a role", which were Roles screen actions.

Needed: the same two writes now arrive from the Access screen. The check itself, the rule, and the stable error code are unchanged. This is wording only.

### A3. `DEC-50`: the sentence that names the Roles screen

Today: "Why not assign roles on the Modules page: the Roles screen already assigns a role to a group or a person, and a second writer of `role_assignment` is the duplicate that `DEC-39` forbids."

Needed: an amendment line that says the one writer is now the Access screen, and that the Modules page still writes no assignment. The Modules page Access column links to `/admin/access?module=<id>&level=use`.

Why: the reason holds, the screen name does not.

### A4. Spec 03: the Access overview is core, not a solutions screen

Today, in the list of what Section 3 does not own: "The solutions hub, the solutions navigation entries, the pinned rail contents, chat themes, and the Access overview screen of the solutions admin. Section 4 and `../modules/solutions/README.md` own them."

Needed: the standalone Access overview is a core screen. It answers the same questions for every module, and it stays reachable when the solutions module is switched off. The solutions module keeps one read-only Access tab inside its configure slide-over, which links to core Access.

Also needed in Spec 03: the admin portal Core navigation gains an Access entry between Roles and Branding.

Why: access is a core table and a core question. A cross-module answer cannot live inside one module, and the requirement says Access must survive when Solutions is off.

### A5. Spec 04, R-15a: name the core screen

Today: "The Add access shortcut and the remove control both open the core role assignment form, with the role, scope, or existing assignment preselected, and that core form performs the write."

Needed: the core form is the Access screen, and the module's tab is read-only with one link. The prefilled link carries the module, the level, and the record: `/admin/access?module=solutions&level=use&record=<id>`. The module still performs no write.

Also needed: R-15 and AC-12 mention "the Access overview" as a solutions screen. Both stay true as behavior, and both now point at the core screen.

### A6. Module contract: an administration level needs a declared role

Today the contract requires `<id>:use` and a seeded `<Display name> user` role for a module with a workspace entry. For administration it only says that enabling the entitlement appends `<id>:admin` to `Tenant administrator`.

Needed: one line that says a module may declare a default role carrying `<id>:admin`, and that core offers an Administer level only when it does. When the module declares none, the Access screen names the gap and offers nothing, because core must not invent a role. The sample data shows this state for a module named Contracts.

Why: the requirement says to derive the levels from real module contracts and to flag a missing contract rather than invent one.

### A7. Record the permission that Access sits behind

Needed: one line in Spec 02 that both Access tabs, Grants and Overview, sit behind `core:roles:manage`. `DEC-23` counts six core keys and resists a seventh, so the read-only Overview shares the write key.

Consequence to accept or refuse: a person holding only `core:audit:read`, the Auditor role, cannot open the Overview. If an auditor must read effective access without holding the write key, that is a seventh key and a `DEC-23` revisit. Raised, not decided.

### A8. Grants needs one read that returns the other sources for a recipient

Needed: when the recipient is a person, the Grants screen names the groups that already carry the same solution or module ("Also through Claims Review"), and the removal confirmation lists every path that stays. Both need one read that returns, for one recipient, the assignments their groups carry. The design computes it in the browser from the sample data, which a server cannot do.

The cheapest shape is the read the Overview already needs: one paged query over `role_assignment` for one subject, expanded through the person's group memberships. Grants needs the same answer without paging, limited to the `use` level. No new table and no new permission key, and it writes nothing.

Why: the requirement says that a resource not granted here may still be reachable elsewhere, that the screen must not label it "No access", and that a removal must not claim a revoke while another assignment still grants it. Without this read, the screen can only guess.

## Unresolved contradictions

### U1. Branding and the Keycloak credential emails (`DEC-40`)

`DEC-40` says a local-account tenant gets Keycloak's built-in credential emails, and that no realm branding sync exists. The realm display name is written once, at realm creation, from `branding.seed.json`. The Branding page lets an administrator change the company name later, and that change reaches the product but not the realm, so the set-password and reset-password emails keep printing the old company name.

The design does not fix this. Two options for the owner: write the realm display name again on Publish through the `genie-admin` client, or state the limit on the Branding Email tab. The design needs one line of copy either way. This contradiction is older than this round and is raised again here because the Access screens send people to set-password emails through the People screen.

### U2. The Contracts sample module declares the wrong keys

`product/sections/people-groups-and-roles/data.json` gives the Contracts module the keys `contracts:read`, `contracts:write`, and `contracts:admin`. The module contract requires `<id>:use` for a module with a workspace entry. The Access sample data uses `contracts:use`. One of the two must change, and the contract is the authority. This is sample data only, in the design tree, and no platform document is wrong.

### U3. A module with more than one record type

The contract allows a module to declare several record types, each with parent types. The Grants screen shows one record type per module, which is what every module in the sample declares. A module with two record types needs a type picker between the level and the records. Flagged, not designed, because no module declares two today.

### U4. A prefilled link that carries a role

Role detail links to `/admin/access?role=<id>`. The Grants path is recipient, module, level, so a role link can preselect the module and the level only when the role is the one behind a level. For a custom role the screen opens on the recipient step, and the administrator uses the secondary dialog. Confirm that this is the wanted behavior, or ask for a fourth entry point that starts from a role.

### U6. One contract is not an everyday catalogue row

The everyday catalogue holds one row per solution and one row per module that owns no records. A module that owns records, for example Contracts, has no single "can use" row: a module-wide grant there means every record now and later, which is broader access, and one record is a scope pick. So Contracts appears twice, once in Broader access as "Every contract, now and in the future", and once in Advanced access for a single contract. Confirm this reading, or tell the design that a module with records also deserves a plain module-wide row in the catalogue. The design does not invent a third shape.

### U7. Whether a group can receive access through another group

The design reads "other sources" for a person only: their direct assignments and the assignments their groups carry. It assumes that a group receives nothing through another group, so a group recipient has no other source except its own broader grant. If the identity provider sends nested groups, or if core resolves a group hierarchy, then a group also needs the "Also through" line and the removal confirmation needs the parent path. Confirm that group nesting does not exist, or the design adds the same line for a group.

### U5. Access for a person who administers one module

The guardrail says module administration must not authorize managing core role assignments. The design follows it: the Access screen is behind `core:roles:manage`, and a holder of `solutions:admin` alone reaches the solution's read-only Access tab and no write control. Make sure that the server refuses the same way, because a module administrator will see a link to a screen they cannot open. The design shows the link because it cannot know the viewer's core keys; the platform may prefer to hide it.
