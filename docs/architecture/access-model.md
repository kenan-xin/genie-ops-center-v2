# Genie Ops Center: Access Model

How a person gets in, how their groups reach Genie Ops Center, and how a group turns into permissions. This document explains. The tables are in `data-shape.md`, the decisions in `../adr/0004-authorization-in-application.md`, `../adr/0006-keycloak-and-better-auth-split.md`, and `../core/decision-log.md`.

## The one rule

The customer's identity provider owns people and groups. Genie Ops Center owns roles and permissions. The only link between them is a list of group names that arrives in the sign-in token. Genie Ops Center never writes to the identity provider, never reads its roles or policies, and never stores a password for a brokered account.

## Sign-in, step by step

1. The person opens Genie Ops Center and clicks sign in.
2. Genie Ops Center sends the browser to Keycloak, to the customer's own realm.
3. Keycloak sends the browser to the customer's identity provider, for example Microsoft Entra ID, Google, or Okta. A tenant that federates an on-premises LDAP or Active Directory signs in on the realm's own form instead, and Keycloak checks the password against the directory.
4. The provider checks the password and any second factor, then returns a signed token to Keycloak. A token is a small signed document with facts about the person. Each fact is a claim: name, email, and the groups the person belongs to.
5. Keycloak puts the group list into its own token under the fixed claim name `groups`, whatever the provider called it. An identity provider mapper in the realm imports the list, and a protocol mapper on the client emits the claim.
6. Keycloak returns its token to Genie Ops Center. Better Auth creates the application session, and the sync described below records the groups.

A customer without an identity provider uses local accounts. Keycloak then holds the password itself, and step 3 and step 4 happen inside Keycloak. Everything from step 5 on is the same.

## Where the group list comes from

Every provider sends groups in its own way: an OIDC claim, a SAML attribute, or LDAP `memberOf`. The command `genie-ops idp set` writes the provider into the realm (for LDAP or Active Directory, a user federation with its group mapper) and creates the mappers that carry that list into the `groups` claim (`../runbooks/keycloak-realm.md`). Genie Ops Center reads only the `groups` claim. That is why the sync code, the Groups screen, and the role mapping are the same for every provider, and why a customer can change providers without a change in the product.

One provider per customer is the current design. A second provider in the same realm is a Keycloak addition with a chooser on the sign-in page. It is not described in the runbook until a customer needs it.

## What happens at each sign-in

The sync function in core receives the `groups` claim and applies three cases (`DEC-41`):

- The claim is present with names: create a `group` row with source `idp` for any name not seen before, set `last_seen_at`, and replace the person's `group_member` rows with source `idp`.
- The claim is present and empty: the person is in no directory group. Their `idp` memberships are removed.
- The claim is absent: the provider sent no list. This happens when Microsoft Entra ID omits the claim for a person in more than 200 groups, and when a mapper is broken. For a person who already has a `user` row, the memberships stay as they were, the sign-in completes, and the audit event `auth:groups_claim_absent` is written. A new person whose claim is absent is refused before the sync runs ("Who may sign in the first time").

The absent case exists because the earlier rule, replace on every sign-in, deleted every role of the person when the list was missing. When `Tenant administrator` is held through a directory group, that locks the tenant out of its own administration. The runbook asks the customer to emit only the groups assigned to the application, which keeps the claim under the provider's limit.

## How a group becomes permissions

A tenant administrator maps a group to a role in the admin portal. The mapping is a `role_assignment` row with `principal_type` equal to `group`, optionally at a scope such as one office or one record. Example: the directory group `Finance-Managers` gets the role `Invoice approver`. From then on `can(user, "invoices:approve")` returns true for every person whose last sign-in listed that group. When the provider removes the person from the group, the next sign-in rewrites their list, and the role is gone. Nobody touches Genie Ops Center for that.

The mapping lives in Genie Ops Center, not in the provider, because the provider knows nothing about product roles, and because the same mapping must work for every provider. A directory group appears in the Groups screen the first time a member who is admitted signs in with it. A refused sign-in creates no group, so for a `jit` launch an administrator adds the groups by claim value first. A tenant administrator can also add it before that, by typing the exact value the provider puts in the `groups` claim, for example `Sales` or an Entra group object ID, and assign roles to it at once, so a large launch has its mappings in place before the first sign-in (`DEC-52`). A group added this way shows as "Not seen yet" until a sign-in lists it, and it is the same row the sync uses from then on. While no sign-in has listed it, it can be deleted; after that it can be archived, never deleted. While a group is archived, the roles assigned to it stop applying, and restoring the group brings them back, so archiving is how an administrator retires a directory group's access without touching the provider.

## Who may sign in the first time

One Keycloak account can reach both Genie Ops Center and genie-studio, so each application decides for itself who gets an account (per-app access, owner decision 2026-09-27, `DEC-7` as amended). genie-studio's admission is genie-studio's own concern (`DEC-8`). A person whose email has no `user` row is admitted at the first sign-in only in these cases:

- They were pre-added: by an administrator in People, by setup from `tenant.yaml`, or by `genie-ops admin add` (`DEC-23`). A pre-added person is activated at the first sign-in in either mode, whatever their groups (R-10 of Specification 02). This is the only way in under `invite` onboarding, the default.
- Under `jit` onboarding, their `groups` claim at that sign-in holds at least one mapped group: a directory group that is not archived and holds at least one role assignment in Genie Ops Center, including a group added before first sign-in (`DEC-52`).

Every other first sign-in is refused with the not-registered message, and nothing is written except the audit event. That covers a `jit` sign-in whose claim holds no mapped group, and a `jit` sign-in with no `groups` claim at all, because an absent claim cannot prove a mapped group. So the group-to-role mappings an administrator makes are also the gate: a large customer maps its groups first, then switches to `jit`, and nobody outside those groups gets an account.

A group counts as mapped when it holds at least one `role_assignment` row as principal, whatever the role (including `Tenant administrator`) and whatever the scope, even if the role grants nothing today, for example for a module that is not entitled. The claim value is matched exactly on the group's `external_id`, as the sync does (`DEC-52`). Local groups never admit a new person, because only a person who already exists can be a member, and groups do not nest.

A refused sign-in leaves nothing behind in Genie Ops Center, so once an administrator maps one of the person's groups or pre-adds them, their next sign-in succeeds. A tenant whose provider sends no `groups` claim, such as a local-accounts tenant, gains nothing from `jit` and stays on `invite`. Switching from `jit` to `invite` keeps every account already created; only new sign-ins are affected.

The rule decides who gets an account, not what they may do afterwards. Once a person exists, their roles decide everything. A person whose last mapped group is later removed keeps their account, but loses the roles that came from that group at their next sign-in (`DEC-41`); an administrator disables or removes them in People to close the account.

## Local groups

A tenant whose provider sends no groups, and a tenant on local accounts, uses local groups. A tenant administrator creates one on the Groups screen and adds people from the People screen. Its rows carry source `local`. The sync never touches them, so a local membership survives every sign-in, and `DEC-41` does not apply. A role is assigned to a local group exactly like to a directory group. One person can hold both kinds at once. A local group can be deleted, after a confirm step that shows the count of members and role assignments that go with it.

## The first administrator

Setup does not ask for a directory group, so it seeds the local group `Genie Administrators` with the role `Tenant administrator`, and pre-adds the first administrators from `tenant.yaml` as pending members. Their first sign-in activates them. `genie-ops admin add <email>` adds a person to that group later, which is the recovery path when the last administrator leaves (`DEC-23`).

## Per-person assignments

A role can also be assigned to one person, as a `role_assignment` row with `principal_type` equal to `user`. This is the exception for a customer without a fitting group. Groups are the normal path because the customer's IT team already manages them.
