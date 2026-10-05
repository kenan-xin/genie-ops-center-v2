# S-G: a large Entra ID customer, `jit`, group-to-role mapping

For the customer's Entra ID administrator and the Genie Ops Center administrator. This is
[S-D](s-d-entra.md) at the scale of an organization that opens Genie Ops Center to thousands of
people at once. Entra ID is the named example; the shape fits any large OIDC or SAML provider.

Do [S-D](s-d-entra.md) first. This guide adds what a large rollout needs.

## App assignment is the gate

1. Turn on "Assignment required" for the Entra application, so only assigned people reach the
   sign-in at all.
2. Assign the groups that should have access, not individual people, so joiners and leavers follow
   their group membership.

## Map the groups to roles before launch

3. Ask the customer for the exact claim value of each group: the group name, or the group object id
   when the tenant sends object ids.
4. In the Groups screen, add each directory group by that exact value and assign it a role. A group
   added before anyone signs in shows "Not seen yet" and is filled by the first sign-in that lists
   it.
5. Map the groups to roles before switching onboarding to `jit`. In `jit`, a newcomer is admitted
   only through a directory group that is mapped to a role, so an unmapped group refuses them.

## Nested groups

6. Choose how Entra sends nested membership. A role ladder (an "HR Head" nested inside "HR
   Manager" nested inside "HR Employee") arrives as separate group values, one per group the person
   holds, and each is mapped on its own. Set the token groups claim to emit the transitive groups
   the rollout needs, and map each value.

## Past the overage limit

7. Entra omits the `groups` claim for a person in more than 200 groups (150 in SAML). Genie Ops
   Center then keeps that person's previous memberships and writes an audit event; it never drops
   every role. Ask the customer to emit only the groups assigned to this application, which keeps
   the claim under the limit. Until then, pre-add and map the groups that matter most, because a
   person whose claim arrives absent and who is new is refused.

## Switch onboarding to `jit`

8. After the mappings are in place, set the onboarding mode to `jit`. A person assigned in Entra
   through a mapped group is created active on first sign-in. A person in no mapped group is
   refused with the not-registered message and no `user` row.
9. Sign in as one member of each mapped group and confirm they land in the workspace with the roles
   their groups give.
